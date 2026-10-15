import { z } from "zod";

export const customerPaymentMethods = [
  "MTN_MOBILE_MONEY",
  "ORANGE_MONEY",
  "CARD",
  "BANK_TRANSFER",
] as const;

export const initiatePaymentSchema = z.object({
  bookingId: z.string().min(1),
  method: z.enum(customerPaymentMethods),
  payerPhone: z.string().trim().max(32).optional(),
});

export const manualPaymentSchema = z.object({
  bookingId: z.string().min(1),
  method: z.enum(["CASH", "BANK_TRANSFER"]),
  amountXaf: z.coerce.number().int().positive(),
  reference: z.string().trim().min(3).max(120),
  note: z.string().trim().max(500).optional(),
});

export const confirmManualSchema = z.object({
  paymentId: z.string().min(1),
  reference: z.string().trim().min(3).max(120),
  note: z.string().trim().max(500).optional(),
});

export const refundRequestSchema = z.object({
  paymentId: z.string().min(1),
  amountXaf: z.coerce.number().int().positive(),
  reason: z.string().trim().min(3).max(500),
});

export const refundDecisionSchema = z.object({
  refundId: z.string().min(1),
  decision: z.enum(["APPROVED", "REJECTED"]),
  comment: z.string().trim().max(500).optional(),
});
