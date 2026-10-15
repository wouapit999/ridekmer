import { randomUUID } from "node:crypto";

import type {
  InitiatePaymentInput,
  InitiatePaymentResult,
  InitiatePayoutInput,
  InitiateRefundInput,
  PaymentMethod,
  PaymentProvider,
  PaymentProviderCapabilities,
  PaymentStatus,
  PaymentStatusResult,
  PayoutResult,
  ReconcileInput,
  ReconcileResult,
  RefundResult,
  WebhookRequest,
  WebhookResult,
} from "../types";
import { PaymentProviderError } from "../errors";
import { signPayload, verifyHmacSignature } from "../webhook-security";

interface MockRecord {
  input: InitiatePaymentInput;
  status: PaymentStatus;
  confirmedAt?: Date;
  refundedXaf: number;
}

export interface MockPaymentProviderOptions {
  id: string;
  method: PaymentMethod;
  webhookSecret?: string;
  /** Phone numbers ending with these digits fail deterministically (for tests/demos). */
  failingSuffixes?: string[];
  capabilities?: Partial<PaymentProviderCapabilities>;
}

/**
 * DEVELOPMENT MOCK. Simulates a push-payment provider in memory: initiation creates a pending
 * transaction that a simulated customer approves via `simulateCustomerApproval` or a signed
 * mock webhook. Clearly labelled as mock in `environment`.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly id: string;
  readonly method: PaymentMethod;
  readonly environment = "mock" as const;
  readonly capabilities: PaymentProviderCapabilities;
  private readonly records = new Map<string, MockRecord>();
  private readonly byIdempotency = new Map<string, string>();
  private readonly refunds = new Map<string, RefundResult & { idempotencyKey: string }>();
  private readonly payouts = new Map<string, PayoutResult & { idempotencyKey: string }>();
  private readonly webhookSecret: string;
  private readonly failingSuffixes: string[];

  constructor(options: MockPaymentProviderOptions) {
    this.id = options.id;
    this.method = options.method;
    this.webhookSecret = options.webhookSecret ?? "mock-webhook-secret";
    this.failingSuffixes = options.failingSuffixes ?? ["00"];
    this.capabilities = {
      supportsPreAuthorisation: false,
      supportsRefunds: true,
      supportsPayouts: options.method !== "CARD",
      supportsWebhooks: true,
      ...options.capabilities,
    };
  }

  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    const existing = this.byIdempotency.get(input.idempotencyKey);
    if (existing) {
      const record = this.records.get(existing)!;
      return { providerReference: existing, status: record.status, redirectUrl: null };
    }
    const providerReference = `${this.id}-${randomUUID()}`;
    this.records.set(providerReference, {
      input,
      status: "REQUIRES_CUSTOMER_ACTION",
      refundedXaf: 0,
    });
    this.byIdempotency.set(input.idempotencyKey, providerReference);
    return {
      providerReference,
      status: "REQUIRES_CUSTOMER_ACTION",
      redirectUrl:
        this.method === "CARD"
          ? `${input.returnUrl ?? "/"}?mockCardSession=${providerReference}`
          : null,
      customerInstruction:
        this.method === "CARD" ? "Mock card page" : "Mock: approve the request on your phone",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    };
  }

  /** Test/demo helper: the simulated customer approves or declines. */
  simulateCustomerApproval(providerReference: string, approve = true): PaymentStatusResult {
    const record = this.records.get(providerReference);
    if (!record) throw new Error("Unknown mock transaction");
    const payer = record.input.payerPhone ?? "";
    const forcedFailure = this.failingSuffixes.some((s) => payer.endsWith(s));
    if (approve && !forcedFailure) {
      record.status = "SUCCESSFUL";
      record.confirmedAt = new Date();
    } else {
      record.status = "FAILED";
    }
    return this.toStatus(providerReference, record);
  }

  /** Build a correctly signed mock webhook body for tests. */
  buildWebhook(
    providerReference: string,
    status: PaymentStatus,
    eventId: string = randomUUID(),
    amountXaf?: number,
    occurredAt: Date = new Date(),
  ): WebhookRequest {
    const record = this.records.get(providerReference);
    const body = JSON.stringify({
      eventId,
      eventType: `payment.${status.toLowerCase()}`,
      reference: providerReference,
      status,
      amount: amountXaf ?? record?.input.amountXaf,
      occurredAt: occurredAt.toISOString(),
    });
    return {
      headers: { "x-mock-signature": signPayload(body, this.webhookSecret) },
      rawBody: body,
      receivedAt: new Date(),
    };
  }

  private toStatus(providerReference: string, record: MockRecord): PaymentStatusResult {
    return {
      providerReference,
      status: record.status,
      amountXaf: record.input.amountXaf,
      confirmedAt: record.confirmedAt,
      failureCode: record.status === "FAILED" ? "MOCK_DECLINED" : undefined,
    };
  }

  async getPaymentStatus(providerReference: string): Promise<PaymentStatusResult> {
    const record = this.records.get(providerReference);
    // Mock state is in-memory: an unknown reference (e.g. after a process restart) is
    // reported as PENDING rather than as a failure, so nothing is cancelled by mistake.
    if (!record) return { providerReference, status: "PENDING", raw: { unknown: true } };
    return this.toStatus(providerReference, record);
  }

  async verifyTransaction(
    providerReference: string,
    expectedAmountXaf: number,
  ): Promise<PaymentStatusResult> {
    const status = await this.getPaymentStatus(providerReference);
    if (status.status === "SUCCESSFUL" && status.amountXaf !== expectedAmountXaf) {
      return { ...status, status: "FAILED", failureCode: "AMOUNT_MISMATCH" };
    }
    return status;
  }

  async processWebhook(request: WebhookRequest): Promise<WebhookResult> {
    const signatureValid = verifyHmacSignature(
      request.rawBody,
      this.webhookSecret,
      request.headers["x-mock-signature"],
    );
    let payload: {
      eventId: string;
      eventType: string;
      reference: string;
      status: PaymentStatus;
      amount?: number;
      occurredAt?: string;
    };
    try {
      payload = JSON.parse(request.rawBody) as typeof payload;
    } catch {
      throw new PaymentProviderError("INVALID_WEBHOOK", "Malformed webhook body", this.id);
    }
    if (!payload || typeof payload.eventId !== "string" || typeof payload.reference !== "string") {
      throw new PaymentProviderError("INVALID_WEBHOOK", "Webhook body missing fields", this.id);
    }
    if (signatureValid) {
      let record = this.records.get(payload.reference);
      if (!record && typeof payload.amount === "number") {
        // A signed event for a transaction this process never saw (restart, other instance):
        // trust the signature and materialise the record so verification can follow.
        record = {
          input: {
            idempotencyKey: `webhook-${payload.eventId}`,
            amountXaf: payload.amount,
            currency: "XAF",
            description: "",
            reference: payload.reference,
          },
          status: payload.status,
          refundedXaf: 0,
        };
        this.records.set(payload.reference, record);
      }
      if (record) {
        record.status = payload.status;
        // The provider's view of the settled amount is whatever the signed event carries.
        if (typeof payload.amount === "number") record.input.amountXaf = payload.amount;
        if (payload.status === "SUCCESSFUL") record.confirmedAt = new Date();
      }
    }
    return {
      eventId: payload.eventId,
      eventType: payload.eventType,
      providerReference: payload.reference,
      status: payload.status,
      amountXaf: payload.amount,
      signatureValid,
      occurredAt: payload.occurredAt ? new Date(payload.occurredAt) : undefined,
      raw: payload,
    };
  }

  async initiateRefund(input: InitiateRefundInput): Promise<RefundResult> {
    const existing = [...this.refunds.values()].find(
      (r) => r.idempotencyKey === input.idempotencyKey,
    );
    if (existing) return existing;
    const record = this.records.get(input.providerReference);
    if (!record || (record.status !== "SUCCESSFUL" && record.status !== "PARTIALLY_REFUNDED")) {
      const failed = {
        providerRefundReference: `rf-${randomUUID()}`,
        status: "FAILED" as const,
        idempotencyKey: input.idempotencyKey,
      };
      this.refunds.set(failed.providerRefundReference, failed);
      return failed;
    }
    if (record.refundedXaf + input.amountXaf > record.input.amountXaf) {
      throw new Error("Refund exceeds captured amount");
    }
    record.refundedXaf += input.amountXaf;
    record.status =
      record.refundedXaf === record.input.amountXaf ? "REFUNDED" : "PARTIALLY_REFUNDED";
    const result = {
      providerRefundReference: `rf-${randomUUID()}`,
      status: "COMPLETED" as const,
      idempotencyKey: input.idempotencyKey,
    };
    this.refunds.set(result.providerRefundReference, result);
    return result;
  }

  async getRefundStatus(providerRefundReference: string): Promise<RefundResult> {
    return (
      this.refunds.get(providerRefundReference) ?? { providerRefundReference, status: "FAILED" }
    );
  }

  async reconcileTransaction(input: ReconcileInput): Promise<ReconcileResult> {
    const status = await this.getPaymentStatus(input.providerReference);
    const matches = status.status === "SUCCESSFUL" && status.amountXaf === input.expectedAmountXaf;
    return {
      providerReference: input.providerReference,
      providerStatus: status.status,
      providerAmountXaf: status.amountXaf,
      matches,
      discrepancy: matches
        ? undefined
        : `provider=${status.status}/${status.amountXaf ?? "?"} expected=${input.expectedAmountXaf}`,
    };
  }

  async initiatePayout(input: InitiatePayoutInput): Promise<PayoutResult> {
    const existing = [...this.payouts.values()].find(
      (p) => p.idempotencyKey === input.idempotencyKey,
    );
    if (existing) return existing;
    const result = {
      providerReference: `po-${randomUUID()}`,
      status: "PAID" as const,
      idempotencyKey: input.idempotencyKey,
    };
    this.payouts.set(result.providerReference, result);
    return result;
  }

  async getPayoutStatus(providerReference: string): Promise<PayoutResult> {
    return this.payouts.get(providerReference) ?? { providerReference, status: "FAILED" };
  }
}
