import { formatXaf } from "@/lib/money";
import { recordAudit } from "@/server/audit";
import { db } from "@/server/db";
import { sendTemplatedNotification } from "@/server/notifications";
import { getProviderForPayment } from "@/server/payments/registry";

import type { Prisma } from "@/generated/prisma/client";
import type { RefundStatus } from "@/generated/prisma/enums";

import { postRefundEntries, tryPost } from "@/features/finance/ledger";

import { getPaymentSettings } from "./settings";

export class RefundError extends Error {
  constructor(
    public readonly code:
      | "NOT_FOUND"
      | "INVALID_STATUS"
      | "AMOUNT_INVALID"
      | "SELF_APPROVAL"
      | "ALREADY_DECIDED"
      | "PROVIDER_ERROR",
    message?: string,
  ) {
    super(message ?? code);
    this.name = "RefundError";
  }
}

const PENDING_REFUND: RefundStatus[] = ["REQUESTED", "PENDING_APPROVAL", "APPROVED", "PROCESSING"];
const PAID = ["SUCCESSFUL", "PARTIALLY_REFUNDED", "REFUNDED"] as const;

/** Amount still refundable on a payment (captured − refunded − refunds in flight). */
export async function refundableAmount(
  client: Prisma.TransactionClient | typeof db,
  paymentId: string,
) {
  const payment = await client.payment.findUnique({ where: { id: paymentId } });
  if (!payment) throw new RefundError("NOT_FOUND");
  if (!(PAID as readonly string[]).includes(payment.status)) return 0;
  const inflight = await client.refund.aggregate({
    where: { paymentId, status: { in: PENDING_REFUND } },
    _sum: { amountXaf: true },
  });
  return Math.max(0, payment.amountXaf - payment.refundedXaf - (inflight._sum.amountXaf ?? 0));
}

/**
 * Create a refund request. Every refund needs an approval by a `refund.approve` holder who is
 * not the requester; amounts at or above the dual-approval threshold need two distinct
 * approvers. Money only moves in `executeRefund`.
 */
export async function requestRefund(input: {
  paymentId: string;
  amountXaf: number;
  reason: string;
  requestedById: string | null;
  bookingId?: string | null;
}) {
  const settings = await getPaymentSettings();
  const refund = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${input.paymentId} FOR UPDATE`;
    const payment = await tx.payment.findUniqueOrThrow({ where: { id: input.paymentId } });
    const available = await refundableAmount(tx, input.paymentId);
    if (!Number.isInteger(input.amountXaf) || input.amountXaf <= 0 || input.amountXaf > available)
      throw new RefundError("AMOUNT_INVALID", `refundable=${available}`);
    const sequence = (await tx.refund.count({ where: { paymentId: input.paymentId } })) + 1;
    return tx.refund.create({
      data: {
        paymentId: payment.id,
        bookingId: input.bookingId ?? payment.bookingId,
        status: "PENDING_APPROVAL",
        amountXaf: input.amountXaf,
        reason: input.reason,
        idempotencyKey: `refund_${payment.id}_${sequence}`,
        requestedById: input.requestedById,
        requiresDualApproval: input.amountXaf >= settings.dualApprovalThresholdXaf,
      },
    });
  });
  await recordAudit({
    actorId: input.requestedById,
    actorType: input.requestedById ? "USER" : "SYSTEM",
    action: "refund.request",
    entityType: "Refund",
    entityId: refund.id,
    after: { amountXaf: refund.amountXaf, requiresDualApproval: refund.requiresDualApproval },
    reason: input.reason,
  });
  return refund;
}

/** Called when a paid booking is cancelled: opens a refund request for finance to approve. */
export async function openRefundForCancelledBooking(
  bookingId: string,
  feeXaf: number,
  reason: string,
) {
  const payments = await db.payment.findMany({
    where: { bookingId, purpose: "RENTAL", status: { in: [...PAID] } },
    orderBy: { confirmedAt: "desc" },
  });
  let remainingFee = Math.max(0, feeXaf);
  const created = [];
  for (const payment of payments) {
    const available = await refundableAmount(db, payment.id);
    const fee = Math.min(remainingFee, available);
    remainingFee -= fee;
    const amount = available - fee;
    if (amount <= 0) continue;
    created.push(
      await requestRefund({
        paymentId: payment.id,
        amountXaf: amount,
        reason,
        requestedById: null,
        bookingId,
      }),
    );
  }
  return created;
}

export async function decideRefund(input: {
  refundId: string;
  approverId: string;
  decision: "APPROVED" | "REJECTED";
  comment?: string | null;
}) {
  const refund = await db.refund.findUnique({ where: { id: input.refundId } });
  if (!refund) throw new RefundError("NOT_FOUND");
  if (refund.status !== "PENDING_APPROVAL" && refund.status !== "REQUESTED")
    throw new RefundError("INVALID_STATUS");
  if (refund.requestedById === input.approverId) throw new RefundError("SELF_APPROVAL");
  const existing = await db.approval.findUnique({
    where: {
      subjectType_subjectId_approverId: {
        subjectType: "REFUND",
        subjectId: refund.id,
        approverId: input.approverId,
      },
    },
  });
  if (existing) throw new RefundError("ALREADY_DECIDED");
  await db.approval.create({
    data: {
      subjectType: "REFUND",
      subjectId: refund.id,
      approverId: input.approverId,
      decision: input.decision,
      comment: input.comment ?? null,
    },
  });
  await recordAudit({
    actorId: input.approverId,
    action: input.decision === "APPROVED" ? "refund.approve" : "refund.reject",
    entityType: "Refund",
    entityId: refund.id,
    reason: input.comment ?? null,
  });
  if (input.decision === "REJECTED") {
    const updated = await db.refund.update({
      where: { id: refund.id },
      data: { status: "REJECTED", failureMessage: input.comment ?? "rejected" },
    });
    await notifyRefund(updated.id);
    return updated;
  }
  const approvals = await db.approval.count({
    where: { subjectType: "REFUND", subjectId: refund.id, decision: "APPROVED" },
  });
  const required = refund.requiresDualApproval ? 2 : 1;
  if (approvals < required) {
    return db.refund.update({ where: { id: refund.id }, data: { status: "PENDING_APPROVAL" } });
  }
  await db.refund.update({
    where: { id: refund.id },
    data: { status: "APPROVED", approvedById: input.approverId, approvedAt: new Date() },
  });
  return executeRefund(refund.id, input.approverId);
}

/** Move the money through the provider (or record a manual refund as PROCESSING). */
export async function executeRefund(refundId: string, actorId: string | null) {
  const refund = await db.refund.findUnique({
    where: { id: refundId },
    include: { payment: true },
  });
  if (!refund) throw new RefundError("NOT_FOUND");
  if (refund.status !== "APPROVED") throw new RefundError("INVALID_STATUS");
  const provider = await getProviderForPayment(refund.payment);
  await db.refund.update({ where: { id: refund.id }, data: { status: "PROCESSING" } });
  try {
    const result = await provider.initiateRefund({
      idempotencyKey: refund.idempotencyKey,
      providerReference: refund.payment.providerReference ?? refund.payment.id,
      amountXaf: refund.amountXaf,
      reason: refund.reason,
    });
    if (result.status === "COMPLETED")
      return completeRefund(refund.id, result.providerRefundReference, actorId);
    if (result.status === "FAILED") {
      const failed = await db.refund.update({
        where: { id: refund.id },
        data: {
          status: "FAILED",
          providerReference: result.providerRefundReference,
          failureMessage: "provider refused",
        },
      });
      await notifyRefund(failed.id);
      return failed;
    }
    return db.refund.update({
      where: { id: refund.id },
      data: { status: "PROCESSING", providerReference: result.providerRefundReference },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "provider error";
    await db.refund.update({
      where: { id: refund.id },
      data: { status: "FAILED", failureMessage: message.slice(0, 500) },
    });
    throw new RefundError("PROVIDER_ERROR");
  }
}

/** Mark a refund settled (provider callback, status poll, or finance for manual refunds). */
export async function completeRefund(
  refundId: string,
  providerReference: string | null,
  actorId: string | null,
) {
  const updated = await db.$transaction(async (tx) => {
    const refund = await tx.refund.findUniqueOrThrow({ where: { id: refundId } });
    if (refund.status === "COMPLETED") return refund;
    if (refund.status !== "PROCESSING" && refund.status !== "APPROVED")
      throw new RefundError("INVALID_STATUS");
    await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${refund.paymentId} FOR UPDATE`;
    const payment = await tx.payment.findUniqueOrThrow({ where: { id: refund.paymentId } });
    const refundedXaf = payment.refundedXaf + refund.amountXaf;
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        refundedXaf,
        status: refundedXaf >= payment.amountXaf ? "REFUNDED" : "PARTIALLY_REFUNDED",
      },
    });
    return tx.refund.update({
      where: { id: refund.id },
      data: {
        status: "COMPLETED",
        processedAt: new Date(),
        providerReference: providerReference ?? refund.providerReference,
      },
    });
  });
  await tryPost(`refund:${updated.id}`, () => postRefundEntries(updated.id));
  await recordAudit({
    actorId,
    actorType: actorId ? "USER" : "SYSTEM",
    action: "refund.completed",
    entityType: "Refund",
    entityId: updated.id,
    after: { amountXaf: updated.amountXaf, providerReference: updated.providerReference },
  });
  await notifyRefund(updated.id);
  return updated;
}

async function notifyRefund(refundId: string) {
  const refund = await db.refund.findUnique({
    where: { id: refundId },
    include: {
      booking: {
        select: {
          reference: true,
          customer: { select: { id: true, name: true, email: true, preferredLocale: true } },
        },
      },
    },
  });
  if (!refund?.booking) return;
  const c = refund.booking.customer;
  const locale = c.preferredLocale === "en" ? "en" : "fr";
  const statusLabel: Record<string, { fr: string; en: string }> = {
    COMPLETED: { fr: "effectué", en: "completed" },
    REJECTED: { fr: "refusé", en: "rejected" },
    FAILED: { fr: "en échec", en: "failed" },
  };
  const label = statusLabel[refund.status];
  if (!label) return;
  await sendTemplatedNotification({
    templateKey: "refund_update",
    channel: "EMAIL",
    locale,
    to: c.email,
    userId: c.id,
    variables: {
      name: c.name,
      reference: refund.booking.reference,
      amount: formatXaf(refund.amountXaf, locale),
      status: label[locale],
    },
    entityType: "Refund",
    entityId: refund.id,
    dedupeKey: `refund_${refund.status.toLowerCase()}:${refund.id}`,
  });
}

export async function listRefundsForAdmin(
  filter: { status?: RefundStatus | "ALL"; page: number },
  pageSize = 25,
) {
  const where = filter.status && filter.status !== "ALL" ? { status: filter.status } : {};
  const [total, refunds] = await Promise.all([
    db.refund.count({ where }),
    db.refund.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (filter.page - 1) * pageSize,
      take: pageSize,
      include: {
        payment: { select: { method: true, provider: true, amountXaf: true } },
        booking: { select: { reference: true } },
        requestedBy: { select: { name: true } },
      },
    }),
  ]);
  return { total, refunds, pages: Math.max(1, Math.ceil(total / pageSize)) };
}
