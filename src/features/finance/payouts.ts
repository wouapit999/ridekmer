import { PaymentProviderError } from "@ridekmer/payments";

import { getPaymentSettings } from "@/features/payments/settings";
import { decryptField } from "@/lib/crypto";
import { formatIsoDate } from "@/lib/dates";
import { formatXaf } from "@/lib/money";
import { maskPhoneForDisplay } from "@/lib/phone";
import { recordAudit } from "@/server/audit";
import { db } from "@/server/db";
import { sendTemplatedNotification } from "@/server/notifications";
import { alertStaff } from "@/server/notifications/alerts";
import { getPaymentProvider } from "@/server/payments/registry";

import type { PayoutMethod, PayoutStatus } from "@/generated/prisma/enums";

import { ownerBalance, postPayoutEntries, tryPost } from "./ledger";

export class PayoutError extends Error {
  constructor(
    public readonly code:
      | "NOT_FOUND"
      | "FORBIDDEN"
      | "INVALID_STATUS"
      | "AMOUNT_INVALID"
      | "NO_DESTINATION"
      | "SELF_APPROVAL"
      | "ALREADY_DECIDED"
      | "PROVIDER_ERROR"
      | "METHOD_UNAVAILABLE",
    message?: string,
  ) {
    super(message ?? code);
    this.name = "PayoutError";
  }
}

async function destinationFor(ownerProfileId: string) {
  const owner = await db.ownerProfile.findUnique({ where: { id: ownerProfileId } });
  if (!owner?.payoutMethod) throw new PayoutError("NO_DESTINATION");
  if (owner.payoutMethod === "BANK_TRANSFER") {
    if (!owner.payoutBankAccountEnc) throw new PayoutError("NO_DESTINATION");
    const account = decryptField(owner.payoutBankAccountEnc);
    return {
      method: owner.payoutMethod,
      masked: `${owner.payoutBankName ?? "bank"} ***${account.slice(-4)}`,
      account,
      phone: null as string | null,
    };
  }
  if (!owner.payoutMobileNumber) throw new PayoutError("NO_DESTINATION");
  return {
    method: owner.payoutMethod,
    masked: maskPhoneForDisplay(owner.payoutMobileNumber),
    account: null as string | null,
    phone: owner.payoutMobileNumber,
  };
}

/** Request a payout from the owner's available balance (owner themselves or finance). */
export async function requestPayout(input: {
  ownerProfileId: string;
  amountXaf: number;
  periodStart: Date;
  periodEnd: Date;
  requestedById: string;
  /** When the requester is the owner, object-level check applies. */
  asOwner?: boolean;
}) {
  const owner = await db.ownerProfile.findUnique({ where: { id: input.ownerProfileId } });
  if (!owner) throw new PayoutError("NOT_FOUND");
  if (input.asOwner && owner.userId !== input.requestedById) throw new PayoutError("FORBIDDEN");
  const destination = await destinationFor(owner.id);
  const balance = await ownerBalance(owner.id);
  if (
    !Number.isInteger(input.amountXaf) ||
    input.amountXaf <= 0 ||
    input.amountXaf > balance.availableXaf
  )
    throw new PayoutError("AMOUNT_INVALID", `available=${balance.availableXaf}`);
  const settings = await getPaymentSettings();
  const payout = await db.ownerPayout.create({
    data: {
      ownerProfileId: owner.id,
      status: "PENDING_APPROVAL",
      method: destination.method,
      amountXaf: input.amountXaf,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      destinationMasked: destination.masked,
      idempotencyKey: `payout_${owner.id}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      requiresDualApproval: input.amountXaf >= settings.dualApprovalThresholdXaf,
      requestedById: input.requestedById,
      statementKey: `${owner.id}:${formatIsoDate(input.periodStart).slice(0, 7)}`,
    },
  });
  await recordAudit({
    actorId: input.requestedById,
    action: "payout.request",
    entityType: "OwnerPayout",
    entityId: payout.id,
    after: {
      amountXaf: payout.amountXaf,
      method: payout.method,
      requiresDualApproval: payout.requiresDualApproval,
    },
  });
  await notifyPayout(payout.id);
  const ownerUser = await db.user.findUnique({
    where: { id: owner.userId },
    select: { name: true },
  });
  await alertStaff("payout.approve", {
    templateKey: "staff_payout_approval",
    variables: (locale) => ({
      amount: formatXaf(payout.amountXaf, locale),
      owner: ownerUser?.name ?? "",
    }),
    entityType: "OwnerPayout",
    entityId: payout.id,
    dedupeKey: `payout_requested:${payout.id}`,
    exceptUserId: input.requestedById,
  });
  return payout;
}

/** Approve or reject. Approver ≠ requester; two distinct approvers above the threshold. */
export async function decidePayout(input: {
  payoutId: string;
  approverId: string;
  decision: "APPROVED" | "REJECTED";
  comment?: string | null;
}) {
  const payout = await db.ownerPayout.findUnique({ where: { id: input.payoutId } });
  if (!payout) throw new PayoutError("NOT_FOUND");
  if (payout.status !== "PENDING_APPROVAL") throw new PayoutError("INVALID_STATUS");
  if (payout.requestedById === input.approverId) throw new PayoutError("SELF_APPROVAL");
  const existing = await db.approval.findUnique({
    where: {
      subjectType_subjectId_approverId: {
        subjectType: "OWNER_PAYOUT",
        subjectId: payout.id,
        approverId: input.approverId,
      },
    },
  });
  if (existing) throw new PayoutError("ALREADY_DECIDED");
  await db.approval.create({
    data: {
      subjectType: "OWNER_PAYOUT",
      subjectId: payout.id,
      approverId: input.approverId,
      decision: input.decision,
      comment: input.comment ?? null,
    },
  });
  await recordAudit({
    actorId: input.approverId,
    action: input.decision === "APPROVED" ? "payout.approve" : "payout.reject",
    entityType: "OwnerPayout",
    entityId: payout.id,
    reason: input.comment ?? null,
  });
  if (input.decision === "REJECTED") {
    const rejected = await db.ownerPayout.update({
      where: { id: payout.id },
      data: { status: "REJECTED", failureMessage: input.comment ?? "rejected" },
    });
    await notifyPayout(rejected.id);
    return rejected;
  }
  const approvals = await db.approval.count({
    where: { subjectType: "OWNER_PAYOUT", subjectId: payout.id, decision: "APPROVED" },
  });
  if (approvals < (payout.requiresDualApproval ? 2 : 1)) return payout;
  return db.ownerPayout.update({ where: { id: payout.id }, data: { status: "APPROVED" } });
}

/** Execute an approved payout through the provider (`payout.process`). Bank transfers stay PROCESSING until marked paid. */
export async function processPayout(payoutId: string, actorId: string) {
  const payout = await db.ownerPayout.findUnique({ where: { id: payoutId } });
  if (!payout) throw new PayoutError("NOT_FOUND");
  if (payout.status !== "APPROVED") throw new PayoutError("INVALID_STATUS");
  const destination = await destinationFor(payout.ownerProfileId);
  await db.ownerPayout.update({ where: { id: payout.id }, data: { status: "PROCESSING" } });
  if (destination.method === "BANK_TRANSFER") {
    await recordAudit({
      actorId,
      action: "payout.process",
      entityType: "OwnerPayout",
      entityId: payout.id,
      after: { method: "BANK_TRANSFER", manual: true },
    });
    return db.ownerPayout.findUniqueOrThrow({ where: { id: payout.id } });
  }
  try {
    const provider = await getPaymentProvider(destination.method);
    if (!provider.capabilities.supportsPayouts) throw new PayoutError("METHOD_UNAVAILABLE");
    const result = await provider.initiatePayout({
      idempotencyKey: payout.idempotencyKey,
      amountXaf: payout.amountXaf,
      destination: { type: "MOBILE_MONEY", phone: destination.phone! },
      reference: payout.id,
      description: `RideKmer payout ${formatIsoDate(payout.periodStart).slice(0, 7)}`,
    });
    await recordAudit({
      actorId,
      action: "payout.process",
      entityType: "OwnerPayout",
      entityId: payout.id,
      after: { provider: provider.id, status: result.status },
    });
    if (result.status === "PAID")
      return markPayoutPaid(payout.id, result.providerReference, actorId);
    if (result.status === "FAILED") return failPayout(payout.id, "provider refused");
    return db.ownerPayout.update({
      where: { id: payout.id },
      data: { providerReference: result.providerReference },
    });
  } catch (error) {
    if (error instanceof PaymentProviderError) {
      await failPayout(payout.id, error.message);
      throw new PayoutError(
        error.code === "NOT_CONFIGURED" ? "METHOD_UNAVAILABLE" : "PROVIDER_ERROR",
      );
    }
    if (error instanceof PayoutError) {
      await failPayout(payout.id, error.message);
      throw error;
    }
    throw error;
  }
}

async function failPayout(payoutId: string, message: string) {
  const failed = await db.ownerPayout.update({
    where: { id: payoutId },
    data: { status: "FAILED", failureMessage: message.slice(0, 300) },
  });
  await notifyPayout(failed.id);
  return failed;
}

/** Mark paid (provider confirmation or finance recording a manual bank transfer); posts the ledger. */
export async function markPayoutPaid(
  payoutId: string,
  providerReference: string | null,
  actorId: string | null,
) {
  const payout = await db.ownerPayout.findUnique({ where: { id: payoutId } });
  if (!payout) throw new PayoutError("NOT_FOUND");
  if (payout.status === "PAID") return payout;
  if (payout.status !== "PROCESSING" && payout.status !== "APPROVED")
    throw new PayoutError("INVALID_STATUS");
  const paid = await db.ownerPayout.update({
    where: { id: payout.id },
    data: {
      status: "PAID",
      paidAt: new Date(),
      providerReference: providerReference ?? payout.providerReference,
    },
  });
  await tryPost(`payout:${paid.id}`, () => postPayoutEntries(paid.id));
  await recordAudit({
    actorId,
    actorType: actorId ? "USER" : "SYSTEM",
    action: "payout.paid",
    entityType: "OwnerPayout",
    entityId: paid.id,
    after: { amountXaf: paid.amountXaf, providerReference: paid.providerReference },
  });
  await notifyPayout(paid.id);
  return paid;
}

async function notifyPayout(payoutId: string) {
  const payout = await db.ownerPayout.findUnique({
    where: { id: payoutId },
    include: {
      ownerProfile: {
        include: { user: { select: { id: true, name: true, email: true, preferredLocale: true } } },
      },
    },
  });
  if (!payout) return;
  const u = payout.ownerProfile.user;
  const locale = u.preferredLocale === "en" ? "en" : "fr";
  const labels: Record<string, { fr: string; en: string }> = {
    PENDING_APPROVAL: { fr: "en attente d'approbation", en: "pending approval" },
    PAID: { fr: "effectué", en: "paid" },
    REJECTED: { fr: "refusé", en: "rejected" },
    FAILED: { fr: "en échec", en: "failed" },
  };
  const label = labels[payout.status];
  if (!label) return;
  await sendTemplatedNotification({
    templateKey: "owner_payout",
    channel: "EMAIL",
    locale,
    to: u.email,
    userId: u.id,
    variables: {
      ownerName: u.name,
      amount: formatXaf(payout.amountXaf, locale),
      period: `${formatIsoDate(payout.periodStart)} → ${formatIsoDate(payout.periodEnd)}`,
      status: label[locale],
    },
    entityType: "OwnerPayout",
    entityId: payout.id,
    dedupeKey: `payout_${payout.status.toLowerCase()}:${payout.id}`,
  });
}

export async function listPayoutsForAdmin(
  filter: { status?: PayoutStatus | "ALL"; page: number },
  pageSize = 25,
) {
  const where = filter.status && filter.status !== "ALL" ? { status: filter.status } : {};
  const [total, payouts] = await Promise.all([
    db.ownerPayout.count({ where }),
    db.ownerPayout.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (filter.page - 1) * pageSize,
      take: pageSize,
      include: {
        ownerProfile: { select: { id: true, displayName: true } },
        requestedBy: { select: { name: true } },
      },
    }),
  ]);
  const approvals = await db.approval.findMany({
    where: { subjectType: "OWNER_PAYOUT", subjectId: { in: payouts.map((p) => p.id) } },
    include: { approver: { select: { id: true, name: true } } },
  });
  return { total, payouts, pages: Math.max(1, Math.ceil(total / pageSize)), approvals };
}

export async function listPayoutsForOwner(ownerProfileId: string) {
  return db.ownerPayout.findMany({
    where: { ownerProfileId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export type { PayoutMethod };
