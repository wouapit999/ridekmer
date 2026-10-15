import { z } from "zod";

export const paymentMethods = [
  "MTN_MOBILE_MONEY",
  "ORANGE_MONEY",
  "CARD",
  "BANK_TRANSFER",
  "CASH",
] as const;
export type PaymentMethod = (typeof paymentMethods)[number];

export const paymentStatuses = [
  "CREATED",
  "PENDING",
  "REQUIRES_CUSTOMER_ACTION",
  "PROCESSING",
  "SUCCESSFUL",
  "FAILED",
  "CANCELLED",
  "EXPIRED",
  "PARTIALLY_REFUNDED",
  "REFUNDED",
  "CHARGEBACK",
] as const;
export type PaymentStatus = (typeof paymentStatuses)[number];

export const payoutStatuses = ["PENDING", "PROCESSING", "PAID", "FAILED"] as const;
export type ProviderPayoutStatus = (typeof payoutStatuses)[number];

export const initiatePaymentSchema = z.object({
  /** Caller-generated idempotency key; the provider must return the same result for the same key. */
  idempotencyKey: z.string().min(8),
  amountXaf: z.number().int().positive(),
  currency: z.literal("XAF").default("XAF"),
  description: z.string().max(140),
  /** Internal reference (booking reference, payment id). */
  reference: z.string().min(1),
  /** E.164 payer number for Mobile Money; undefined for card. */
  payerPhone: z.string().optional(),
  /** Return URL for hosted card pages. */
  returnUrl: z.string().url().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});
export type InitiatePaymentInput = z.infer<typeof initiatePaymentSchema>;

export interface InitiatePaymentResult {
  providerReference: string;
  status: PaymentStatus;
  /** Provider-hosted page to redirect to (cards) or null for push-USSD flows. */
  redirectUrl?: string | null;
  /** Human instruction for the customer (e.g. "Dial *126# to approve"). */
  customerInstruction?: string;
  expiresAt?: Date;
  raw?: unknown;
}

export interface PaymentStatusResult {
  providerReference: string;
  status: PaymentStatus;
  amountXaf?: number;
  failureCode?: string;
  failureMessage?: string;
  confirmedAt?: Date;
  raw?: unknown;
}

export interface WebhookRequest {
  headers: Record<string, string>;
  rawBody: string;
  receivedAt: Date;
}

export interface WebhookResult {
  /** Stable provider event id used for replay protection. */
  eventId: string;
  eventType: string;
  providerReference: string;
  status: PaymentStatus;
  amountXaf?: number;
  signatureValid: boolean;
  occurredAt?: Date;
  raw: unknown;
}

export interface InitiateRefundInput {
  idempotencyKey: string;
  providerReference: string;
  amountXaf: number;
  reason: string;
}

export interface RefundResult {
  providerRefundReference: string;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  raw?: unknown;
}

export interface ReconcileInput {
  providerReference: string;
  expectedAmountXaf: number;
}

export interface ReconcileResult {
  providerReference: string;
  providerStatus: PaymentStatus;
  providerAmountXaf?: number;
  matches: boolean;
  discrepancy?: string;
}

export interface InitiatePayoutInput {
  idempotencyKey: string;
  amountXaf: number;
  destination: { type: "MOBILE_MONEY"; phone: string } | { type: "BANK"; accountRef: string };
  reference: string;
  description: string;
}

export interface PayoutResult {
  providerReference: string;
  status: ProviderPayoutStatus;
  raw?: unknown;
}

export interface PaymentProviderCapabilities {
  /** True only when the provider exposes a genuine hold/pre-authorisation operation. */
  supportsPreAuthorisation: boolean;
  supportsRefunds: boolean;
  supportsPayouts: boolean;
  supportsWebhooks: boolean;
}

/**
 * Provider-independent payment interface. Every adapter (MTN MoMo, Orange Money, card,
 * bank transfer, cash) implements this. Methods are idempotent by idempotencyKey.
 */
export interface PaymentProvider {
  readonly id: string;
  readonly method: PaymentMethod;
  readonly capabilities: PaymentProviderCapabilities;
  /** "mock" | "sandbox" | "production" — surfaced in admin so nobody mistakes a mock for live. */
  readonly environment: "mock" | "sandbox" | "production";
  initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult>;
  getPaymentStatus(providerReference: string): Promise<PaymentStatusResult>;
  verifyTransaction(
    providerReference: string,
    expectedAmountXaf: number,
  ): Promise<PaymentStatusResult>;
  processWebhook(request: WebhookRequest): Promise<WebhookResult>;
  initiateRefund(input: InitiateRefundInput): Promise<RefundResult>;
  getRefundStatus(providerRefundReference: string): Promise<RefundResult>;
  reconcileTransaction(input: ReconcileInput): Promise<ReconcileResult>;
  initiatePayout(input: InitiatePayoutInput): Promise<PayoutResult>;
  getPayoutStatus(providerReference: string): Promise<PayoutResult>;
}
