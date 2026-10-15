import {
  MockPaymentProvider,
  PaymentProviderError,
  type PaymentProvider,
  type PaymentStatus as ProviderPaymentStatus,
  type WebhookRequest,
} from "@ridekmer/payments";
import { addHours, addMinutes, subHours } from "date-fns";

import { confirmBookingAfterPayment } from "@/features/bookings/service";
import { formatIsoDate } from "@/lib/dates";
import { getEnv } from "@/lib/env";
import { sha256Hex } from "@/lib/crypto";
import { logger } from "@/lib/logger";
import { formatXaf } from "@/lib/money";
import { maskPhoneForDisplay, parsePhone } from "@/lib/phone";
import { recordAudit } from "@/server/audit";
import { db } from "@/server/db";
import { sendTemplatedNotification } from "@/server/notifications";
import {
  WEBHOOK_SLUGS,
  getPaymentProvider,
  listAvailableMethods,
  webhookSlugFor,
} from "@/server/payments/registry";

import type { Prisma } from "@/generated/prisma/client";
import type { ActorType, PaymentMethod, PaymentStatus } from "@/generated/prisma/enums";

import { getPaymentSettings } from "./settings";

export class PaymentError extends Error {
  constructor(
    public readonly code:
      | "NOT_FOUND"
      | "FORBIDDEN"
      | "INVALID_STATUS"
      | "METHOD_UNAVAILABLE"
      | "PHONE_REQUIRED"
      | "PHONE_INVALID"
      | "ALREADY_PAID"
      | "PROVIDER_ERROR"
      | "AMOUNT_INVALID"
      | "NOT_MOCK",
    message?: string,
  ) {
    super(message ?? code);
    this.name = "PaymentError";
  }
}

/** Statuses from which a payment can still move to SUCCESSFUL. */
export const OPEN_PAYMENT_STATUSES: PaymentStatus[] = [
  "CREATED",
  "PENDING",
  "REQUIRES_CUSTOMER_ACTION",
  "PROCESSING",
];
export const PAID_STATUSES: PaymentStatus[] = ["SUCCESSFUL", "PARTIALLY_REFUNDED", "REFUNDED"];
const MOBILE_MONEY: PaymentMethod[] = ["MTN_MOBILE_MONEY", "ORANGE_MONEY"];

export function methodLabel(method: PaymentMethod): string {
  return {
    MTN_MOBILE_MONEY: "MTN Mobile Money",
    ORANGE_MONEY: "Orange Money",
    CARD: "Carte bancaire / Card",
    BANK_TRANSFER: "Virement / Bank transfer",
    CASH: "Espèces / Cash",
  }[method];
}

/** Amount the customer must pay for a booking: rental total plus the refundable deposit. */
export async function amountDueForBooking(bookingId: string) {
  const snapshot = await db.bookingPriceSnapshot.findFirst({
    where: { bookingId },
    orderBy: { sequence: "desc" },
  });
  if (!snapshot) throw new PaymentError("NOT_FOUND", "No price snapshot");
  return {
    amountXaf: snapshot.totalRentalXaf + snapshot.securityDepositXaf,
    depositXaf: snapshot.securityDepositXaf,
    totalRentalXaf: snapshot.totalRentalXaf,
  };
}

export async function paidAmountForBooking(
  client: Prisma.TransactionClient | typeof db,
  bookingId: string,
) {
  const agg = await client.payment.aggregate({
    where: { bookingId, purpose: "RENTAL", status: { in: PAID_STATUSES } },
    _sum: { amountXaf: true },
  });
  return agg._sum.amountXaf ?? 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Initiation
// ─────────────────────────────────────────────────────────────────────────────

export async function initiatePaymentForBooking(input: {
  bookingId: string;
  userId: string;
  method: PaymentMethod;
  payerPhone?: string | null;
  returnUrl?: string;
  locale?: "fr" | "en";
}) {
  const booking = await db.booking.findUnique({
    where: { id: input.bookingId },
    include: { customer: { select: { id: true, name: true, email: true, phoneNumber: true } } },
  });
  if (!booking) throw new PaymentError("NOT_FOUND");
  if (booking.customerId !== input.userId) throw new PaymentError("FORBIDDEN");
  if (booking.status !== "PAYMENT_PENDING") throw new PaymentError("INVALID_STATUS");

  const available = await listAvailableMethods();
  const chosen = available.find((m) => m.method === input.method && m.customerSelectable);
  if (!chosen) throw new PaymentError("METHOD_UNAVAILABLE");

  let payerPhone: string | undefined;
  if (MOBILE_MONEY.includes(input.method)) {
    if (!input.payerPhone) throw new PaymentError("PHONE_REQUIRED");
    const parsed = parsePhone(input.payerPhone, false);
    if (!parsed) throw new PaymentError("PHONE_INVALID");
    payerPhone = parsed.e164;
  }

  const due = await amountDueForBooking(booking.id);
  const settings = await getPaymentSettings();
  const provider = await getPaymentProvider(input.method);

  // Serialise per booking: one open payment at a time, retries reuse it.
  const payment = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${booking.id} FOR UPDATE`;
    if ((await paidAmountForBooking(tx, booking.id)) >= due.amountXaf) {
      throw new PaymentError("ALREADY_PAID");
    }
    const open = await tx.payment.findFirst({
      where: { bookingId: booking.id, purpose: "RENTAL", status: { in: OPEN_PAYMENT_STATUSES } },
      orderBy: { createdAt: "desc" },
    });
    if (open && open.method === input.method && open.providerReference) {
      return { payment: open, reused: true };
    }
    if (open) {
      await tx.payment.update({
        where: { id: open.id },
        data: { status: "CANCELLED", failureCode: "SUPERSEDED" },
      });
    }
    const sequence = (await tx.payment.count({ where: { bookingId: booking.id } })) + 1;
    const created = await tx.payment.create({
      data: {
        bookingId: booking.id,
        purpose: "RENTAL",
        method: input.method,
        provider: provider.id,
        providerEnvironment: provider.environment,
        status: "CREATED",
        amountXaf: due.amountXaf,
        depositXaf: due.depositXaf,
        idempotencyKey: `pay_${booking.id}_RENTAL_${sequence}`,
        payerPhoneMasked: payerPhone ? maskPhoneForDisplay(payerPhone) : null,
        description: `RideKmer ${booking.reference}`,
        attempts: { create: { attemptNumber: 1, status: "CREATED" } },
      },
    });
    return { payment: created, reused: false };
  });
  if (payment.reused) return payment.payment;

  const record = payment.payment;
  try {
    const result = await provider.initiatePayment({
      idempotencyKey: record.idempotencyKey,
      amountXaf: record.amountXaf,
      currency: "XAF",
      description: record.description ?? `RideKmer ${booking.reference}`,
      reference: booking.reference,
      payerPhone,
      returnUrl: input.returnUrl,
      metadata: { bookingId: booking.id, paymentId: record.id },
    });
    const expiresAt =
      result.expiresAt ??
      (input.method === "BANK_TRANSFER"
        ? addHours(new Date(), settings.bankTransferExpiryHours)
        : addMinutes(new Date(), settings.mobileMoneyExpiryMinutes));
    const instruction =
      input.method === "BANK_TRANSFER"
        ? settings.bankTransferInstructions[input.locale ?? "fr"]
        : (result.customerInstruction ?? null);
    const updated = await db.$transaction(async (tx) => {
      const u = await tx.payment.update({
        where: { id: record.id },
        data: {
          status: result.status,
          providerReference: result.providerReference,
          redirectUrl: result.redirectUrl ?? null,
          customerInstruction: instruction,
          expiresAt,
          lastCheckedAt: new Date(),
        },
      });
      await tx.paymentAttempt.update({
        where: { paymentId_attemptNumber: { paymentId: record.id, attemptNumber: 1 } },
        data: {
          status: result.status,
          providerRequestId: result.providerReference,
          completedAt: new Date(),
        },
      });
      // A pending bank transfer needs longer than the Mobile Money payment window.
      if (booking.paymentDueAt && expiresAt > booking.paymentDueAt) {
        await tx.booking.update({ where: { id: booking.id }, data: { paymentDueAt: expiresAt } });
      }
      return u;
    });
    await recordAudit({
      actorId: input.userId,
      action: "payment.initiate",
      entityType: "Payment",
      entityId: record.id,
      after: { method: input.method, provider: provider.id, amountXaf: record.amountXaf },
    });
    if (payerPhone) {
      await sendTemplatedNotification({
        templateKey: "payment_pending",
        channel: "SMS",
        locale: input.locale ?? "fr",
        to: payerPhone,
        userId: booking.customerId,
        variables: {
          name: booking.customer.name,
          reference: booking.reference,
          amount: formatXaf(record.amountXaf, input.locale ?? "fr"),
          method: methodLabel(input.method),
        },
        entityType: "Payment",
        entityId: record.id,
      });
    }
    return updated;
  } catch (error) {
    const message = error instanceof Error ? error.message : "provider error";
    await db.payment.update({
      where: { id: record.id },
      data: {
        status: "FAILED",
        failureCode: error instanceof PaymentProviderError ? error.code : "PROVIDER_ERROR",
        failureMessage: message.slice(0, 500),
        attempts: {
          update: {
            where: { paymentId_attemptNumber: { paymentId: record.id, attemptNumber: 1 } },
            data: {
              status: "FAILED",
              errorMessage: message.slice(0, 500),
              completedAt: new Date(),
            },
          },
        },
      },
    });
    logger.error("payment.initiate_failed", { paymentId: record.id, error: message });
    throw new PaymentError("PROVIDER_ERROR");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Settlement
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mark a payment SUCCESSFUL (idempotent) and confirm the booking when the rental is fully
 * paid. This is the ONLY path that confirms a booking from a payment: it runs after
 * server-side verification (webhook + verifyTransaction, status poll, or staff recording).
 */
export async function applySuccessfulPayment(input: {
  paymentId: string;
  actorType: ActorType;
  actorId?: string | null;
  providerReference?: string | null;
  confirmedAt?: Date;
}) {
  const outcome = await db.$transaction(async (tx) => {
    const [row] = await tx.$queryRaw<
      Array<{ id: string; status: PaymentStatus }>
    >`SELECT id, status FROM "Payment" WHERE id = ${input.paymentId} FOR UPDATE`;
    if (!row) throw new PaymentError("NOT_FOUND");
    if (PAID_STATUSES.includes(row.status)) return { changed: false as const };
    if (!OPEN_PAYMENT_STATUSES.includes(row.status)) {
      // A late success on a payment we already closed: record it for finance review.
      logger.warn("payment.late_success", { paymentId: row.id, previous: row.status });
    }
    const payment = await tx.payment.update({
      where: { id: row.id },
      data: {
        status: "SUCCESSFUL",
        confirmedAt: input.confirmedAt ?? new Date(),
        providerReference: input.providerReference ?? undefined,
        failureCode: null,
        failureMessage: null,
        lastCheckedAt: new Date(),
      },
      include: { booking: { select: { id: true, status: true, customerId: true } } },
    });
    return { changed: true as const, payment, previous: row.status };
  });
  if (!outcome.changed) return { confirmedBooking: false, alreadyApplied: true };

  const { payment } = outcome;
  await recordAudit({
    actorId: input.actorId ?? null,
    actorType: input.actorType,
    action: "payment.succeeded",
    entityType: "Payment",
    entityId: payment.id,
    before: { status: outcome.previous },
    after: { status: "SUCCESSFUL", amountXaf: payment.amountXaf },
  });

  let confirmedBooking = false;
  if (payment.booking && payment.purpose === "RENTAL") {
    const due = await amountDueForBooking(payment.booking.id);
    const paid = await paidAmountForBooking(db, payment.booking.id);
    if (payment.booking.status === "PAYMENT_PENDING" && paid >= due.amountXaf) {
      await confirmBookingAfterPayment(payment.booking.id, input.actorType, payment.id);
      confirmedBooking = true;
    }
    await notifyPaymentSuccess(payment.id, confirmedBooking);
  }
  return { confirmedBooking, alreadyApplied: false };
}

async function notifyPaymentSuccess(paymentId: string, confirmed: boolean) {
  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    include: {
      booking: {
        include: {
          customer: { select: { id: true, name: true, email: true, preferredLocale: true } },
          vehicle: { select: { make: true, model: true } },
          pickupBranch: { select: { nameFr: true, nameEn: true } },
        },
      },
    },
  });
  if (!payment?.booking) return;
  const b = payment.booking;
  const locale = b.customer.preferredLocale === "en" ? "en" : "fr";
  await sendTemplatedNotification({
    templateKey: "payment_successful",
    channel: "EMAIL",
    locale,
    to: b.customer.email,
    userId: b.customer.id,
    variables: {
      name: b.customer.name,
      reference: b.reference,
      amount: formatXaf(payment.amountXaf, locale),
    },
    entityType: "Payment",
    entityId: payment.id,
    dedupeKey: `payment_successful:${payment.id}`,
  });
  if (confirmed) {
    await sendTemplatedNotification({
      templateKey: "booking_confirmed",
      channel: "EMAIL",
      locale,
      to: b.customer.email,
      userId: b.customer.id,
      variables: {
        name: b.customer.name,
        reference: b.reference,
        vehicle: `${b.vehicle.make} ${b.vehicle.model}`,
        start: formatIsoDate(b.startAt),
        pickup:
          b.pickupMode === "DELIVERY"
            ? (b.pickupAddress ?? "")
            : ((locale === "en" ? b.pickupBranch?.nameEn : b.pickupBranch?.nameFr) ?? ""),
      },
      entityType: "Booking",
      entityId: b.id,
      dedupeKey: `booking_confirmed:${b.id}`,
    });
  }
}

async function markPaymentClosed(
  paymentId: string,
  status: Extract<PaymentStatus, "FAILED" | "CANCELLED" | "EXPIRED">,
  failureCode?: string,
  failureMessage?: string,
) {
  const result = await db.payment.updateMany({
    where: { id: paymentId, status: { in: OPEN_PAYMENT_STATUSES } },
    data: {
      status,
      failureCode,
      failureMessage: failureMessage?.slice(0, 500),
      lastCheckedAt: new Date(),
    },
  });
  if (result.count > 0) {
    await recordAudit({
      actorType: "SYSTEM",
      action: `payment.${status.toLowerCase()}`,
      entityType: "Payment",
      entityId: paymentId,
      after: { status, failureCode },
    });
  }
  return result.count > 0;
}

/**
 * Apply a provider-reported status to a payment. SUCCESSFUL is only accepted after
 * `verifyTransaction` confirms the status AND the exact amount.
 */
async function applyProviderStatus(
  provider: PaymentProvider,
  payment: {
    id: string;
    amountXaf: number;
    providerReference: string | null;
    status: PaymentStatus;
  },
  reported: ProviderPaymentStatus,
  actorType: ActorType,
  failure?: { code?: string; message?: string },
): Promise<{ applied: PaymentStatus | "UNCHANGED"; error?: string }> {
  if (reported === "SUCCESSFUL") {
    if (!payment.providerReference) return { applied: "UNCHANGED", error: "NO_REFERENCE" };
    const verified = await provider.verifyTransaction(payment.providerReference, payment.amountXaf);
    if (verified.status !== "SUCCESSFUL" || verified.amountXaf !== payment.amountXaf) {
      logger.warn("payment.verification_failed", {
        paymentId: payment.id,
        status: verified.status,
        code: verified.failureCode,
      });
      await db.payment.update({
        where: { id: payment.id },
        data: {
          failureCode: verified.failureCode ?? "VERIFICATION_FAILED",
          failureMessage: verified.failureMessage ?? null,
          lastCheckedAt: new Date(),
        },
      });
      return { applied: "UNCHANGED", error: verified.failureCode ?? "VERIFICATION_FAILED" };
    }
    await applySuccessfulPayment({
      paymentId: payment.id,
      actorType,
      providerReference: payment.providerReference,
      confirmedAt: verified.confirmedAt,
    });
    return { applied: "SUCCESSFUL" };
  }
  if (reported === "FAILED" || reported === "CANCELLED" || reported === "EXPIRED") {
    const changed = await markPaymentClosed(payment.id, reported, failure?.code, failure?.message);
    return { applied: changed ? reported : "UNCHANGED" };
  }
  if (
    (reported === "PENDING" ||
      reported === "PROCESSING" ||
      reported === "REQUIRES_CUSTOMER_ACTION") &&
    OPEN_PAYMENT_STATUSES.includes(payment.status) &&
    payment.status !== reported
  ) {
    await db.payment.update({
      where: { id: payment.id },
      data: { status: reported, lastCheckedAt: new Date() },
    });
    return { applied: reported };
  }
  await db.payment.update({ where: { id: payment.id }, data: { lastCheckedAt: new Date() } });
  return { applied: "UNCHANGED" };
}

/** Poll the provider for an open payment (customer "check status", reconciliation job). */
export async function refreshPaymentStatus(paymentId: string, actorType: ActorType = "SYSTEM") {
  const payment = await db.payment.findUnique({ where: { id: paymentId } });
  if (!payment) throw new PaymentError("NOT_FOUND");
  if (!OPEN_PAYMENT_STATUSES.includes(payment.status) || !payment.providerReference) {
    return { status: payment.status, applied: "UNCHANGED" as const };
  }
  const provider = await getPaymentProvider(payment.method);
  if (!provider.capabilities.supportsWebhooks && provider.environment === "production") {
    // Manual methods: the application record is authoritative; only expiry applies.
    if (payment.expiresAt && payment.expiresAt <= new Date()) {
      await markPaymentClosed(payment.id, "EXPIRED", "TIMEOUT");
      return { status: "EXPIRED" as PaymentStatus, applied: "EXPIRED" as const };
    }
    return { status: payment.status, applied: "UNCHANGED" as const };
  }
  const reported = await provider.getPaymentStatus(payment.providerReference);
  const result = await applyProviderStatus(provider, payment, reported.status, actorType, {
    code: reported.failureCode,
    message: reported.failureMessage,
  });
  const fresh = await db.payment.findUniqueOrThrow({ where: { id: paymentId } });
  return { status: fresh.status, applied: result.applied, error: result.error };
}

// ─────────────────────────────────────────────────────────────────────────────
// Webhooks
// ─────────────────────────────────────────────────────────────────────────────

export interface WebhookOutcome {
  httpStatus: number;
  result:
    | "PROCESSED"
    | "IGNORED"
    | "REPLAY_REJECTED"
    | "INVALID_SIGNATURE"
    | "UNKNOWN_PROVIDER"
    | "MALFORMED"
    | "FAILED";
  detail?: string;
}

/**
 * Ingest a provider callback. Every event is persisted; duplicates (same provider event id)
 * and events outside the replay window are rejected; signatures are verified by the adapter;
 * a success is only applied after `verifyTransaction`. Returns the HTTP status to answer.
 */
export async function ingestPaymentWebhook(
  slug: string,
  request: WebhookRequest,
): Promise<WebhookOutcome> {
  const method = WEBHOOK_SLUGS[slug];
  if (!method) return { httpStatus: 404, result: "UNKNOWN_PROVIDER" };
  let provider: PaymentProvider;
  try {
    provider = await getPaymentProvider(method);
  } catch (error) {
    if (error instanceof PaymentProviderError)
      return { httpStatus: 404, result: "UNKNOWN_PROVIDER" };
    throw error;
  }
  if (!provider.capabilities.supportsWebhooks)
    return { httpStatus: 404, result: "UNKNOWN_PROVIDER" };

  let parsed;
  try {
    parsed = await provider.processWebhook(request);
  } catch (error) {
    if (error instanceof PaymentProviderError) {
      logger.warn("payment.webhook.malformed", { provider: provider.id, code: error.code });
      return { httpStatus: 400, result: "MALFORMED" };
    }
    throw error;
  }

  const payloadHash = sha256Hex(request.rawBody);
  const windowSeconds = getEnv().PAYMENT_WEBHOOK_REPLAY_WINDOW_SECONDS;
  const stale =
    parsed.occurredAt !== undefined &&
    Math.abs(request.receivedAt.getTime() - parsed.occurredAt.getTime()) > windowSeconds * 1000;
  const initialStatus = !parsed.signatureValid ? "IGNORED" : stale ? "REPLAY_REJECTED" : "RECEIVED";

  let event;
  try {
    event = await db.paymentWebhookEvent.create({
      data: {
        provider: provider.id,
        providerEventId: parsed.eventId,
        eventType: parsed.eventType,
        signatureValid: parsed.signatureValid,
        status: initialStatus,
        payloadHash,
        payload: parsed.raw as Prisma.InputJsonValue,
        receivedAt: request.receivedAt,
        error: !parsed.signatureValid
          ? "INVALID_SIGNATURE"
          : stale
            ? "OUTSIDE_REPLAY_WINDOW"
            : null,
        processedAt: initialStatus === "RECEIVED" ? null : new Date(),
      },
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      logger.warn("payment.webhook.replay", { provider: provider.id, eventId: parsed.eventId });
      await recordAudit({
        actorType: "WEBHOOK",
        action: "payment.webhook.replay_rejected",
        entityType: "PaymentWebhookEvent",
        entityId: parsed.eventId,
        after: { provider: provider.id },
      });
      return { httpStatus: 200, result: "REPLAY_REJECTED", detail: "duplicate event id" };
    }
    throw error;
  }
  if (!parsed.signatureValid) {
    logger.warn("payment.webhook.invalid_signature", { provider: provider.id, eventId: event.id });
    return { httpStatus: 401, result: "INVALID_SIGNATURE" };
  }
  if (stale) return { httpStatus: 200, result: "REPLAY_REJECTED", detail: "outside replay window" };

  const payment = await db.payment.findFirst({
    where: { provider: provider.id, providerReference: parsed.providerReference },
  });
  if (!payment) {
    await db.paymentWebhookEvent.update({
      where: { id: event.id },
      data: { status: "IGNORED", error: "UNKNOWN_PAYMENT", processedAt: new Date() },
    });
    return { httpStatus: 200, result: "IGNORED", detail: "unknown payment" };
  }
  try {
    const applied = await applyProviderStatus(provider, payment, parsed.status, "WEBHOOK");
    await db.paymentWebhookEvent.update({
      where: { id: event.id },
      data: {
        status: applied.error ? "FAILED" : "PROCESSED",
        paymentId: payment.id,
        error: applied.error ?? null,
        processedAt: new Date(),
      },
    });
    return applied.error
      ? { httpStatus: 200, result: "FAILED", detail: applied.error }
      : { httpStatus: 200, result: "PROCESSED", detail: applied.applied };
  } catch (error) {
    const message = error instanceof Error ? error.message : "processing error";
    await db.paymentWebhookEvent.update({
      where: { id: event.id },
      data: {
        status: "FAILED",
        paymentId: payment.id,
        error: message.slice(0, 500),
        processedAt: new Date(),
      },
    });
    logger.error("payment.webhook.failed", { eventId: event.id, error: message });
    return { httpStatus: 500, result: "FAILED", detail: "processing error" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock controls (never in production)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Development/test helper: emulate the customer's approval or decline by building a signed
 * mock webhook and pushing it through the real ingestion path. Refused outside mock mode.
 */
export async function simulateMockOutcome(input: {
  paymentId: string;
  userId: string;
  outcome: "approve" | "decline";
}) {
  const env = getEnv();
  if (env.NODE_ENV === "production" && env.APP_ENV === "production")
    throw new PaymentError("NOT_MOCK");
  const payment = await db.payment.findUnique({
    where: { id: input.paymentId },
    include: { booking: { select: { customerId: true } } },
  });
  if (!payment) throw new PaymentError("NOT_FOUND");
  if (payment.booking?.customerId !== input.userId) throw new PaymentError("FORBIDDEN");
  if (!payment.providerReference || !OPEN_PAYMENT_STATUSES.includes(payment.status))
    throw new PaymentError("INVALID_STATUS");
  const provider = await getPaymentProvider(payment.method);
  if (!(provider instanceof MockPaymentProvider)) throw new PaymentError("NOT_MOCK");
  const slug = webhookSlugFor(payment.method);
  if (!slug) throw new PaymentError("NOT_MOCK");
  const request = provider.buildWebhook(
    payment.providerReference,
    input.outcome === "approve" ? "SUCCESSFUL" : "FAILED",
    undefined,
    payment.amountXaf,
  );
  return ingestPaymentWebhook(slug, request);
}

// ─────────────────────────────────────────────────────────────────────────────
// Manual payments (finance / branch staff)
// ─────────────────────────────────────────────────────────────────────────────

/** Record a cash or bank-transfer payment received outside any provider. Audited. */
export async function recordManualPayment(input: {
  bookingId: string;
  method: Extract<PaymentMethod, "CASH" | "BANK_TRANSFER">;
  amountXaf: number;
  reference: string;
  note?: string | null;
  actorId: string;
}) {
  const booking = await db.booking.findUnique({ where: { id: input.bookingId } });
  if (!booking) throw new PaymentError("NOT_FOUND");
  if (booking.status !== "PAYMENT_PENDING") throw new PaymentError("INVALID_STATUS");
  const settings = await getPaymentSettings();
  if (input.method === "CASH" && !settings.cashEnabled)
    throw new PaymentError("METHOD_UNAVAILABLE");
  if (input.method === "BANK_TRANSFER" && !settings.bankTransferEnabled)
    throw new PaymentError("METHOD_UNAVAILABLE");
  const due = await amountDueForBooking(booking.id);
  if (!Number.isInteger(input.amountXaf) || input.amountXaf !== due.amountXaf)
    throw new PaymentError("AMOUNT_INVALID");

  // Reuse the customer's pending bank-transfer record when one exists.
  const payment = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${booking.id} FOR UPDATE`;
    if ((await paidAmountForBooking(tx, booking.id)) >= due.amountXaf)
      throw new PaymentError("ALREADY_PAID");
    const open = await tx.payment.findFirst({
      where: { bookingId: booking.id, purpose: "RENTAL", status: { in: OPEN_PAYMENT_STATUSES } },
    });
    if (open) {
      return tx.payment.update({
        where: { id: open.id },
        data: {
          method: input.method,
          provider: input.method === "CASH" ? "manual-cash" : "manual-bank-transfer",
          providerEnvironment: "production",
          providerReference: input.reference,
          recordedById: input.actorId,
          metadata: { note: input.note ?? null },
        },
      });
    }
    const sequence = (await tx.payment.count({ where: { bookingId: booking.id } })) + 1;
    return tx.payment.create({
      data: {
        bookingId: booking.id,
        purpose: "RENTAL",
        method: input.method,
        provider: input.method === "CASH" ? "manual-cash" : "manual-bank-transfer",
        providerEnvironment: "production",
        status: "PENDING",
        amountXaf: due.amountXaf,
        depositXaf: due.depositXaf,
        idempotencyKey: `pay_${booking.id}_RENTAL_${sequence}`,
        providerReference: input.reference,
        description: `RideKmer ${booking.reference}`,
        recordedById: input.actorId,
        metadata: { note: input.note ?? null },
        attempts: {
          create: { attemptNumber: 1, status: "PENDING", completedAt: new Date() },
        },
      },
    });
  });
  await recordAudit({
    actorId: input.actorId,
    action: "payment.record_manual",
    entityType: "Payment",
    entityId: payment.id,
    after: { method: input.method, amountXaf: payment.amountXaf, reference: input.reference },
    reason: input.note ?? null,
  });
  return applySuccessfulPayment({
    paymentId: payment.id,
    actorType: "USER",
    actorId: input.actorId,
    providerReference: input.reference,
  }).then(() => db.payment.findUniqueOrThrow({ where: { id: payment.id } }));
}

/** Finance confirms a bank transfer the customer announced from the pay page. */
export async function confirmManualPayment(input: {
  paymentId: string;
  actorId: string;
  reference: string;
  note?: string | null;
}) {
  const payment = await db.payment.findUnique({ where: { id: input.paymentId } });
  if (!payment) throw new PaymentError("NOT_FOUND");
  if (payment.method !== "BANK_TRANSFER" && payment.method !== "CASH")
    throw new PaymentError("INVALID_STATUS");
  if (!OPEN_PAYMENT_STATUSES.includes(payment.status)) throw new PaymentError("INVALID_STATUS");
  await db.payment.update({
    where: { id: payment.id },
    data: { recordedById: input.actorId, metadata: { note: input.note ?? null } },
  });
  await recordAudit({
    actorId: input.actorId,
    action: "payment.confirm_manual",
    entityType: "Payment",
    entityId: payment.id,
    after: { reference: input.reference },
    reason: input.note ?? null,
  });
  return applySuccessfulPayment({
    paymentId: payment.id,
    actorType: "USER",
    actorId: input.actorId,
    providerReference: input.reference,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Reconciliation job
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Daily/periodic reconciliation: expire stale requests, poll open payments, and compare
 * successful payments with the provider's view. Discrepancies are audited for finance.
 */
export async function reconcilePayments(now = new Date()) {
  const expired = await db.payment.findMany({
    where: { status: { in: OPEN_PAYMENT_STATUSES }, expiresAt: { lte: now } },
    select: { id: true },
    take: 500,
  });
  for (const p of expired) await markPaymentClosed(p.id, "EXPIRED", "TIMEOUT");

  const open = await db.payment.findMany({
    where: {
      status: { in: OPEN_PAYMENT_STATUSES },
      providerReference: { not: null },
      method: { in: ["MTN_MOBILE_MONEY", "ORANGE_MONEY", "CARD"] },
    },
    select: { id: true },
    take: 200,
  });
  let polled = 0;
  for (const p of open) {
    try {
      await refreshPaymentStatus(p.id, "CRON");
      polled += 1;
    } catch (error) {
      logger.warn("payment.reconcile.poll_failed", { paymentId: p.id, error });
    }
  }

  const toReconcile = await db.payment.findMany({
    where: {
      status: { in: PAID_STATUSES },
      providerReference: { not: null },
      method: { in: ["MTN_MOBILE_MONEY", "ORANGE_MONEY", "CARD"] },
      OR: [{ reconciledAt: null }, { reconciledAt: { lt: subHours(now, 24) } }],
      confirmedAt: { gte: subHours(now, 24 * 45) },
    },
    take: 500,
  });
  let reconciled = 0;
  const discrepancies: string[] = [];
  for (const p of toReconcile) {
    try {
      const provider = await getPaymentProvider(p.method);
      const result = await provider.reconcileTransaction({
        providerReference: p.providerReference!,
        expectedAmountXaf: p.amountXaf,
      });
      if (result.matches) {
        await db.payment.update({ where: { id: p.id }, data: { reconciledAt: now } });
        reconciled += 1;
      } else {
        discrepancies.push(p.id);
        await recordAudit({
          actorType: "CRON",
          action: "payment.reconcile.discrepancy",
          entityType: "Payment",
          entityId: p.id,
          after: { discrepancy: result.discrepancy, providerStatus: result.providerStatus },
        });
      }
    } catch (error) {
      logger.warn("payment.reconcile.failed", { paymentId: p.id, error });
    }
  }
  logger.info("cron.reconcile_payments", {
    expired: expired.length,
    polled,
    reconciled,
    discrepancies: discrepancies.length,
  });
  return { expired: expired.length, polled, reconciled, discrepancies };
}

// ─────────────────────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────────────────────

export async function getPaymentForCustomer(paymentId: string, userId: string) {
  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    include: { booking: { select: { id: true, reference: true, customerId: true, status: true } } },
  });
  if (!payment || payment.booking?.customerId !== userId) throw new PaymentError("NOT_FOUND");
  return payment;
}

export async function listPaymentsForBooking(bookingId: string) {
  return db.payment.findMany({
    where: { bookingId },
    orderBy: { createdAt: "desc" },
    include: { refunds: { orderBy: { createdAt: "desc" } } },
  });
}
