import { randomUUID } from "node:crypto";

import { unsupported } from "../errors";
import type {
  InitiatePaymentInput,
  InitiatePaymentResult,
  InitiatePayoutInput,
  InitiateRefundInput,
  PaymentMethod,
  PaymentProvider,
  PaymentProviderCapabilities,
  PaymentStatusResult,
  PayoutResult,
  ReconcileInput,
  ReconcileResult,
  RefundResult,
  WebhookRequest,
  WebhookResult,
} from "../types";

export interface ManualProviderOptions {
  method: Extract<PaymentMethod, "BANK_TRANSFER" | "CASH">;
  /** Instruction shown to the customer (bank details, branch address). */
  customerInstruction: { fr: string; en: string };
  /** Pending bank transfers expire after this many hours unless confirmed by finance. */
  expiryHours?: number;
}

/**
 * Manual payment methods (bank transfer, cash). Nothing moves automatically: the provider
 * only records intent; an authorised finance user confirms receipt (`payment.record_manual`)
 * and the application marks the payment successful. Refunds and payouts are recorded by hand.
 */
export class ManualPaymentProvider implements PaymentProvider {
  readonly id: string;
  readonly method: PaymentMethod;
  readonly environment = "production" as const;
  readonly capabilities: PaymentProviderCapabilities = {
    supportsPreAuthorisation: false,
    supportsRefunds: false,
    supportsPayouts: false,
    supportsWebhooks: false,
  };
  private readonly instruction: { fr: string; en: string };
  private readonly expiryHours: number;

  constructor(options: ManualProviderOptions) {
    this.id = options.method === "CASH" ? "manual-cash" : "manual-bank-transfer";
    this.method = options.method;
    this.instruction = options.customerInstruction;
    this.expiryHours = options.expiryHours ?? 48;
  }

  instructionFor(locale: "fr" | "en"): string {
    return this.instruction[locale];
  }

  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    return {
      providerReference: `${this.id}-${input.reference}-${randomUUID().slice(0, 8)}`,
      status: "PENDING",
      redirectUrl: null,
      customerInstruction: this.instruction.fr,
      expiresAt: new Date(Date.now() + this.expiryHours * 3_600_000),
    };
  }

  /** Manual payments have no remote state: the application record is authoritative. */
  async getPaymentStatus(providerReference: string): Promise<PaymentStatusResult> {
    return { providerReference, status: "PENDING" };
  }

  async verifyTransaction(providerReference: string): Promise<PaymentStatusResult> {
    return { providerReference, status: "PENDING" };
  }

  processWebhook(_request: WebhookRequest): Promise<WebhookResult> {
    return Promise.reject(unsupported(this.id, "webhooks"));
  }

  async initiateRefund(input: InitiateRefundInput): Promise<RefundResult> {
    // Recorded manually by finance; the reference documents the manual transfer.
    return { providerRefundReference: `manual-refund-${input.idempotencyKey}`, status: "PENDING" };
  }

  async getRefundStatus(providerRefundReference: string): Promise<RefundResult> {
    return { providerRefundReference, status: "PENDING" };
  }

  async reconcileTransaction(input: ReconcileInput): Promise<ReconcileResult> {
    return {
      providerReference: input.providerReference,
      providerStatus: "PENDING",
      matches: true,
      discrepancy: undefined,
    };
  }

  initiatePayout(_input: InitiatePayoutInput): Promise<PayoutResult> {
    return Promise.reject(unsupported(this.id, "payouts"));
  }

  getPayoutStatus(_providerReference: string): Promise<PayoutResult> {
    return Promise.reject(unsupported(this.id, "payouts"));
  }
}
