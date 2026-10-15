import { logger } from "@/lib/logger";
import { recordAudit } from "@/server/audit";
import { db } from "@/server/db";

import type { Prisma } from "@/generated/prisma/client";
import type { LedgerAccountKind } from "@/generated/prisma/enums";

import {
  additionalChargePostings,
  depositRetentionPostings,
  expensePostings,
  ownerPayableKey,
  payoutPostings,
  refundPostings,
  rentalPaymentPostings,
  type PostingLine,
} from "./postings";

type Tx = Prisma.TransactionClient | typeof db;

/** Resolve (or create) a ledger account by key; owner payable accounts are created on demand. */
export async function accountId(client: Tx, key: string): Promise<string> {
  const existing = await client.ledgerAccount.findUnique({ where: { key }, select: { id: true } });
  if (existing) return existing.id;
  if (key.startsWith("owner_payable:")) {
    const ownerProfileId = key.slice("owner_payable:".length);
    const owner = await client.ownerProfile.findUnique({
      where: { id: ownerProfileId },
      select: { displayName: true },
    });
    const created = await client.ledgerAccount.create({
      data: {
        key,
        kind: "OWNER_PAYABLE",
        name: `Owner payable — ${owner?.displayName ?? ownerProfileId}`,
        ownerProfileId,
      },
    });
    return created.id;
  }
  const kind = KEY_KINDS[key];
  if (!kind) throw new Error(`Unknown ledger account ${key}`);
  const created = await client.ledgerAccount.create({ data: { key, kind, name: key } });
  return created.id;
}

const KEY_KINDS: Record<string, LedgerAccountKind> = {
  platform_cash: "PLATFORM_CASH",
  customer_deposits_held: "CUSTOMER_DEPOSITS_HELD",
  platform_revenue: "PLATFORM_REVENUE",
  tax_payable: "TAX_PAYABLE",
  fees_receivable: "FEES_RECEIVABLE",
  adjustments: "ADJUSTMENTS",
  payout_clearing: "PAYOUT_CLEARING",
};

export interface PostingContext {
  source: string;
  bookingId?: string | null;
  paymentId?: string | null;
  refundId?: string | null;
  payoutId?: string | null;
  expenseId?: string | null;
  vehicleId?: string | null;
  ownerProfileId?: string | null;
  effectiveAt?: Date;
}

/**
 * Write a set of posting lines atomically and idempotently. The idempotency key is
 * `<source>:<type>:<index>`; a duplicate source is a no-op, so hooks and the catch-up job can
 * both call this safely.
 */
export async function postLines(lines: PostingLine[], ctx: PostingContext): Promise<number> {
  if (lines.length === 0) return 0;
  const existing = await db.ledgerEntry.count({
    where: { idempotencyKey: { startsWith: `${ctx.source}:` } },
  });
  if (existing > 0) return 0;
  try {
    await db.$transaction(async (tx) => {
      for (const [index, l] of lines.entries()) {
        await tx.ledgerEntry.create({
          data: {
            type: l.type,
            amountXaf: l.amountXaf,
            debitAccountId: await accountId(tx, l.debit),
            creditAccountId: await accountId(tx, l.credit),
            bookingId: ctx.bookingId ?? null,
            paymentId: ctx.paymentId ?? null,
            refundId: ctx.refundId ?? null,
            payoutId: ctx.payoutId ?? null,
            expenseId: ctx.expenseId ?? null,
            vehicleId: ctx.vehicleId ?? null,
            ownerProfileId:
              ctx.ownerProfileId ??
              (l.credit.startsWith("owner_payable:")
                ? l.credit.slice(14)
                : l.debit.startsWith("owner_payable:")
                  ? l.debit.slice(14)
                  : null),
            description: l.description,
            effectiveAt: ctx.effectiveAt ?? new Date(),
            idempotencyKey: `${ctx.source}:${l.type}:${index}`,
          },
        });
      }
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return 0;
    throw error;
  }
  return lines.length;
}

// ─── Event hooks ─────────────────────────────────────────────────────────────

async function bookingContext(bookingId: string) {
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: {
      vehicle: { select: { id: true, ownerProfileId: true, ownershipModel: true } },
      priceSnapshots: { orderBy: { sequence: "desc" }, take: 1 },
    },
  });
  if (!booking) return null;
  const snapshot = booking.priceSnapshots[0];
  const ownerProfileId =
    booking.vehicle.ownershipModel === "RIDEKMER_OWNED" ? null : booking.vehicle.ownerProfileId;
  return { booking, snapshot, ownerProfileId };
}

/** Post the entries for a SUCCESSFUL payment (rental or additional charge). Idempotent. */
export async function postPaymentEntries(paymentId: string): Promise<number> {
  const payment = await db.payment.findUnique({ where: { id: paymentId } });
  if (
    !payment ||
    !["SUCCESSFUL", "PARTIALLY_REFUNDED", "REFUNDED"].includes(payment.status) ||
    !payment.bookingId
  )
    return 0;
  const ctx = await bookingContext(payment.bookingId);
  if (!ctx) return 0;
  const reference = ctx.booking.reference;
  const lines =
    payment.purpose === "ADDITIONAL_CHARGE"
      ? additionalChargePostings(reference, payment.amountXaf)
      : rentalPaymentPostings({
          reference,
          amountXaf: payment.amountXaf,
          depositXaf: payment.depositXaf,
          totalRentalXaf: ctx.snapshot?.totalRentalXaf ?? 0,
          ownerShareXaf: ctx.snapshot?.ownerShareXaf ?? 0,
          taxXaf: ctx.snapshot?.taxXaf ?? 0,
          ownerProfileId: ctx.ownerProfileId,
        });
  return postLines(lines, {
    source: `payment:${payment.id}`,
    bookingId: payment.bookingId,
    paymentId: payment.id,
    vehicleId: ctx.booking.vehicleId,
    ownerProfileId: ctx.ownerProfileId,
    effectiveAt: payment.confirmedAt ?? new Date(),
  });
}

/** Post the entries for a COMPLETED refund. Idempotent. */
export async function postRefundEntries(refundId: string): Promise<number> {
  const refund = await db.refund.findUnique({
    where: { id: refundId },
    include: { payment: true },
  });
  if (!refund || refund.status !== "COMPLETED" || !refund.payment.bookingId) return 0;
  const ctx = await bookingContext(refund.payment.bookingId);
  if (!ctx) return 0;
  // Deposit refunds come first: earlier completed refunds on this payment consumed part of it.
  const earlier = await db.refund.aggregate({
    where: {
      paymentId: refund.paymentId,
      status: "COMPLETED",
      processedAt: { lt: refund.processedAt ?? new Date() },
      id: { not: refund.id },
    },
    _sum: { amountXaf: true },
  });
  const depositLeft = Math.max(0, refund.payment.depositXaf - (earlier._sum.amountXaf ?? 0));
  const lines = refundPostings({
    reference: ctx.booking.reference,
    refundXaf: refund.amountXaf,
    depositPortionXaf: depositLeft,
    ownerShareXaf: ctx.snapshot?.ownerShareXaf ?? 0,
    totalRentalXaf: ctx.snapshot?.totalRentalXaf ?? 0,
    ownerProfileId: ctx.ownerProfileId,
  });
  return postLines(lines, {
    source: `refund:${refund.id}`,
    bookingId: refund.payment.bookingId,
    paymentId: refund.paymentId,
    refundId: refund.id,
    vehicleId: ctx.booking.vehicleId,
    ownerProfileId: ctx.ownerProfileId,
    effectiveAt: refund.processedAt ?? new Date(),
  });
}

/** Post the deposit retained at return settlement (deduction kept from the customer). */
export async function postSettlementEntries(bookingId: string): Promise<number> {
  const ctx = await bookingContext(bookingId);
  if (!ctx || !ctx.booking.depositSettledAt) return 0;
  const inspection = await db.inspection.findFirst({
    where: { bookingId, type: "RETURN", status: { in: ["SUBMITTED", "ACKNOWLEDGED"] } },
    orderBy: { submittedAt: "desc" },
  });
  if (!inspection) return 0;
  const paidDeposit =
    (
      await db.payment.aggregate({
        where: {
          bookingId,
          purpose: "RENTAL",
          status: { in: ["SUCCESSFUL", "PARTIALLY_REFUNDED", "REFUNDED"] },
        },
        _sum: { depositXaf: true },
      })
    )._sum.depositXaf ?? 0;
  const retained = Math.min(inspection.deductionXaf, paidDeposit);
  if (retained <= 0) return 0;
  const lines = depositRetentionPostings({
    reference: ctx.booking.reference,
    retainedXaf: retained,
    damageXaf: inspection.damageXaf,
    ownerShareBps: 10_000 - (ctx.snapshot?.commissionBps ?? 10_000),
    ownerProfileId: ctx.ownerProfileId,
  });
  return postLines(lines, {
    source: `settlement:${bookingId}`,
    bookingId,
    vehicleId: ctx.booking.vehicleId,
    ownerProfileId: ctx.ownerProfileId,
    effectiveAt: ctx.booking.depositSettledAt,
  });
}

/** Post an ALLOCATED expense. */
export async function postExpenseEntries(expenseId: string): Promise<number> {
  const expense = await db.expense.findUnique({
    where: { id: expenseId },
    include: { vehicle: { select: { ownershipModel: true } } },
  });
  if (!expense || expense.status !== "ALLOCATED") return 0;
  const ownerProfileId =
    expense.vehicle.ownershipModel === "RIDEKMER_OWNED" ? null : expense.ownerProfileId;
  const lines = expensePostings({
    reference: expense.description.slice(0, 60),
    ownerShareXaf: ownerProfileId ? expense.ownerShareXaf : 0,
    ridekmerShareXaf: ownerProfileId ? expense.ridekmerShareXaf : expense.amountXaf,
    ownerProfileId,
  });
  return postLines(lines, {
    source: `expense:${expense.id}`,
    expenseId: expense.id,
    vehicleId: expense.vehicleId,
    ownerProfileId,
    effectiveAt: expense.approvedAt ?? expense.incurredOn,
  });
}

/** Post a PAID payout. */
export async function postPayoutEntries(payoutId: string): Promise<number> {
  const payout = await db.ownerPayout.findUnique({ where: { id: payoutId } });
  if (!payout || payout.status !== "PAID") return 0;
  return postLines(
    payoutPostings(payout.id.slice(-8).toUpperCase(), payout.ownerProfileId, payout.amountXaf),
    {
      source: `payout:${payout.id}`,
      payoutId: payout.id,
      ownerProfileId: payout.ownerProfileId,
      effectiveAt: payout.paidAt ?? new Date(),
    },
  );
}

/** Manual adjustment by finance (audited): positive credits the owner, negative debits them. */
export async function postManualAdjustment(input: {
  ownerProfileId: string;
  amountXaf: number;
  reason: string;
  actorId: string;
}) {
  if (!Number.isInteger(input.amountXaf) || input.amountXaf === 0)
    throw new Error("INVALID_AMOUNT");
  const key = `adjustment:${input.ownerProfileId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  const owner = ownerPayableKey(input.ownerProfileId);
  const lines: PostingLine[] =
    input.amountXaf > 0
      ? [
          {
            type: "ADJUSTMENT",
            debit: "adjustments",
            credit: owner,
            amountXaf: input.amountXaf,
            description: input.reason,
          },
        ]
      : [
          {
            type: "ADJUSTMENT",
            debit: owner,
            credit: "adjustments",
            amountXaf: -input.amountXaf,
            description: input.reason,
          },
        ];
  await postLines(lines, { source: key, ownerProfileId: input.ownerProfileId });
  await recordAudit({
    actorId: input.actorId,
    action: "ledger.adjust",
    entityType: "OwnerProfile",
    entityId: input.ownerProfileId,
    after: { amountXaf: input.amountXaf },
    reason: input.reason,
  });
}

// ─── Balances ────────────────────────────────────────────────────────────────

/** Credits − debits for an account (liabilities, revenue, owner payable). */
export async function accountBalance(key: string, until?: Date): Promise<number> {
  const account = await db.ledgerAccount.findUnique({ where: { key }, select: { id: true } });
  if (!account) return 0;
  const dateFilter = until ? { effectiveAt: { lt: until } } : {};
  const [credits, debits] = await Promise.all([
    db.ledgerEntry.aggregate({
      where: { creditAccountId: account.id, ...dateFilter },
      _sum: { amountXaf: true },
    }),
    db.ledgerEntry.aggregate({
      where: { debitAccountId: account.id, ...dateFilter },
      _sum: { amountXaf: true },
    }),
  ]);
  return (credits._sum.amountXaf ?? 0) - (debits._sum.amountXaf ?? 0);
}

/** Owner balance: what RideKmer owes (payable) minus payouts already in flight. */
export async function ownerBalance(ownerProfileId: string) {
  const payable = await accountBalance(ownerPayableKey(ownerProfileId));
  const inflight = await db.ownerPayout.aggregate({
    where: { ownerProfileId, status: { in: ["PENDING_APPROVAL", "APPROVED", "PROCESSING"] } },
    _sum: { amountXaf: true },
  });
  const pending = inflight._sum.amountXaf ?? 0;
  return {
    payableXaf: payable,
    pendingPayoutsXaf: pending,
    availableXaf: Math.max(0, payable - pending),
  };
}

/** Catch-up: post anything that has no ledger entries yet (hook failures, backfill). */
export async function postMissingLedgerEntries() {
  let posted = 0;
  const payments = await db.payment.findMany({
    where: {
      status: { in: ["SUCCESSFUL", "PARTIALLY_REFUNDED", "REFUNDED"] },
      bookingId: { not: null },
      ledgerEntries: { none: {} },
    },
    select: { id: true },
    take: 500,
  });
  for (const p of payments) posted += await postPaymentEntries(p.id);
  const refunds = await db.refund.findMany({
    where: { status: "COMPLETED", ledgerEntries: { none: {} } },
    select: { id: true },
    take: 500,
  });
  for (const r of refunds) posted += await postRefundEntries(r.id);
  const settlements = await db.booking.findMany({
    where: {
      depositSettledAt: { not: null },
      ledgerEntries: { none: { idempotencyKey: { startsWith: "settlement:" } } },
    },
    select: { id: true },
    take: 500,
  });
  for (const b of settlements) posted += await postSettlementEntries(b.id);
  const expenses = await db.expense.findMany({
    where: { status: "ALLOCATED", ledgerEntries: { none: {} } },
    select: { id: true },
    take: 500,
  });
  for (const e of expenses) posted += await postExpenseEntries(e.id);
  const payouts = await db.ownerPayout.findMany({
    where: { status: "PAID", ledgerEntries: { none: {} } },
    select: { id: true },
    take: 500,
  });
  for (const p of payouts) posted += await postPayoutEntries(p.id);
  logger.info("ledger.catch_up", { posted });
  return { posted };
}

/** Safe hook wrapper: ledger failures are logged, never block the business operation. */
export async function tryPost(label: string, fn: () => Promise<number>) {
  try {
    return await fn();
  } catch (error) {
    logger.error("ledger.post_failed", {
      label,
      error: error instanceof Error ? error.message : error,
    });
    return 0;
  }
}
