"use server";

import { revalidatePath } from "next/cache";

import { getCurrentSession, requirePermissionOrThrow } from "@/server/auth/session";
import { enforceRateLimit, RateLimitedError } from "@/server/security/rate-limit";

import { RefundError, completeRefund, decideRefund, requestRefund } from "./refunds";
import {
  confirmManualSchema,
  initiatePaymentSchema,
  manualPaymentSchema,
  refundDecisionSchema,
  refundRequestSchema,
} from "./schemas";
import {
  PaymentError,
  confirmManualPayment,
  initiatePaymentForBooking,
  recordManualPayment,
  refreshPaymentStatus,
  simulateMockOutcome,
} from "./service";

export interface PaymentActionResult {
  ok: boolean;
  message?: string;
  paymentId?: string;
  redirectUrl?: string | null;
  status?: string;
  errors?: Record<string, string>;
}

function fail(error: unknown): PaymentActionResult {
  if (error instanceof PaymentError || error instanceof RefundError)
    return { ok: false, message: error.code };
  if (error instanceof RateLimitedError) return { ok: false, message: "RATE_LIMITED" };
  throw error;
}

function revalidate(bookingId?: string) {
  revalidatePath("/[locale]/account/bookings", "layout");
  revalidatePath("/[locale]/admin/payments", "layout");
  revalidatePath("/[locale]/admin/refunds", "layout");
  if (bookingId) revalidatePath("/[locale]/admin/bookings", "layout");
}

export async function initiatePaymentAction(
  _prev: PaymentActionResult,
  formData: FormData,
): Promise<PaymentActionResult> {
  const current = await getCurrentSession();
  if (!current) return { ok: false, message: "UNAUTHENTICATED" };
  const parsed = initiatePaymentSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, message: "INVALID" };
  try {
    await enforceRateLimit("payment.initiate", current.user.id);
    const payment = await initiatePaymentForBooking({
      bookingId: parsed.data.bookingId,
      userId: current.user.id,
      method: parsed.data.method,
      payerPhone: parsed.data.payerPhone || current.user.phoneNumber,
      transactionId: parsed.data.transactionId,
      locale: current.user.preferredLocale,
      returnUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/${current.user.preferredLocale}/account/bookings/${parsed.data.bookingId}/pay`,
    });
    revalidate(parsed.data.bookingId);
    return {
      ok: true,
      paymentId: payment.id,
      redirectUrl: payment.redirectUrl,
      status: payment.status,
    };
  } catch (error) {
    return fail(error);
  }
}

export async function checkPaymentStatusAction(
  _prev: PaymentActionResult,
  formData: FormData,
): Promise<PaymentActionResult> {
  const current = await getCurrentSession();
  if (!current) return { ok: false, message: "UNAUTHENTICATED" };
  const paymentId = String(formData.get("paymentId") ?? "");
  try {
    const { getPaymentForCustomer } = await import("./service");
    await getPaymentForCustomer(paymentId, current.user.id);
    const result = await refreshPaymentStatus(paymentId, "USER");
    revalidate();
    return { ok: true, paymentId, status: result.status };
  } catch (error) {
    return fail(error);
  }
}

/** Development only: emulate the customer's approval/decline through the webhook path. */
export async function simulateMockPaymentAction(
  _prev: PaymentActionResult,
  formData: FormData,
): Promise<PaymentActionResult> {
  const current = await getCurrentSession();
  if (!current) return { ok: false, message: "UNAUTHENTICATED" };
  const paymentId = String(formData.get("paymentId") ?? "");
  const outcome = formData.get("outcome") === "decline" ? "decline" : "approve";
  try {
    const result = await simulateMockOutcome({ paymentId, userId: current.user.id, outcome });
    revalidate();
    return { ok: result.result === "PROCESSED", paymentId, message: result.result };
  } catch (error) {
    return fail(error);
  }
}

export async function recordManualPaymentAction(
  _prev: PaymentActionResult,
  formData: FormData,
): Promise<PaymentActionResult> {
  const { user } = await requirePermissionOrThrow("payment.record_manual");
  const parsed = manualPaymentSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success)
    return {
      ok: false,
      message: "INVALID",
      errors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.code])),
    };
  try {
    const payment = await recordManualPayment({ ...parsed.data, actorId: user.id });
    revalidate(parsed.data.bookingId);
    return { ok: true, paymentId: payment.id, message: "RECORDED" };
  } catch (error) {
    return fail(error);
  }
}

export async function confirmManualPaymentAction(
  _prev: PaymentActionResult,
  formData: FormData,
): Promise<PaymentActionResult> {
  const { user } = await requirePermissionOrThrow("payment.record_manual");
  const parsed = confirmManualSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, message: "INVALID" };
  try {
    await confirmManualPayment({ ...parsed.data, actorId: user.id });
    revalidate("x");
    return { ok: true, paymentId: parsed.data.paymentId, message: "CONFIRMED" };
  } catch (error) {
    return fail(error);
  }
}

export async function refreshPaymentAdminAction(
  _prev: PaymentActionResult,
  formData: FormData,
): Promise<PaymentActionResult> {
  await requirePermissionOrThrow("payment.reconcile");
  const paymentId = String(formData.get("paymentId") ?? "");
  try {
    const result = await refreshPaymentStatus(paymentId, "USER");
    revalidate("x");
    return { ok: true, paymentId, status: result.status, message: "REFRESHED" };
  } catch (error) {
    return fail(error);
  }
}

export async function requestRefundAction(
  _prev: PaymentActionResult,
  formData: FormData,
): Promise<PaymentActionResult> {
  const { user } = await requirePermissionOrThrow("refund.request");
  const parsed = refundRequestSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, message: "INVALID" };
  try {
    await requestRefund({ ...parsed.data, requestedById: user.id });
    revalidate("x");
    return { ok: true, paymentId: parsed.data.paymentId, message: "REFUND_REQUESTED" };
  } catch (error) {
    return fail(error);
  }
}

export async function decideRefundAction(
  _prev: PaymentActionResult,
  formData: FormData,
): Promise<PaymentActionResult> {
  const { user } = await requirePermissionOrThrow("refund.approve");
  const parsed = refundDecisionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, message: "INVALID" };
  try {
    const refund = await decideRefund({ ...parsed.data, approverId: user.id });
    revalidate("x");
    return { ok: true, message: `REFUND_${refund.status}` };
  } catch (error) {
    return fail(error);
  }
}

export async function completeManualRefundAction(
  _prev: PaymentActionResult,
  formData: FormData,
): Promise<PaymentActionResult> {
  const { user } = await requirePermissionOrThrow("refund.approve");
  const refundId = String(formData.get("refundId") ?? "");
  const reference = String(formData.get("reference") ?? "").trim();
  if (reference.length < 3) return { ok: false, message: "INVALID" };
  try {
    await completeRefund(refundId, reference, user.id);
    revalidate("x");
    return { ok: true, message: "REFUND_COMPLETED" };
  } catch (error) {
    return fail(error);
  }
}
