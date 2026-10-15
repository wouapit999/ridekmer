import { addMonths, startOfMonth } from "date-fns";

import { db } from "@/server/db";

import type { LedgerEntryType } from "@/generated/prisma/enums";

import { accountBalance } from "./ledger";

export function monthRange(month: string | undefined, now = new Date()) {
  const m = /^\d{4}-\d{2}$/.test(month ?? "")
    ? new Date(`${month}-01T00:00:00Z`)
    : startOfMonth(now);
  const start = startOfMonth(m);
  return { start, end: addMonths(start, 1), key: start.toISOString().slice(0, 7) };
}

async function accountFlow(key: string, start: Date, end: Date) {
  const account = await db.ledgerAccount.findUnique({ where: { key }, select: { id: true } });
  if (!account) return { credits: 0, debits: 0 };
  const [c, d] = await Promise.all([
    db.ledgerEntry.aggregate({
      where: { creditAccountId: account.id, effectiveAt: { gte: start, lt: end } },
      _sum: { amountXaf: true },
    }),
    db.ledgerEntry.aggregate({
      where: { debitAccountId: account.id, effectiveAt: { gte: start, lt: end } },
      _sum: { amountXaf: true },
    }),
  ]);
  return { credits: c._sum.amountXaf ?? 0, debits: d._sum.amountXaf ?? 0 };
}

export async function getFinanceDashboard(month?: string) {
  const { start, end, key } = monthRange(month);
  const paid = ["SUCCESSFUL", "PARTIALLY_REFUNDED", "REFUNDED"] as const;
  const [
    collected,
    revenue,
    tax,
    refundsDone,
    refundsPending,
    payoutsPaid,
    payoutsPending,
    expensesAllocated,
    depositsHeld,
    ownerPayables,
    ledgerCount,
    recent,
  ] = await Promise.all([
    db.payment.aggregate({
      where: { status: { in: [...paid] }, confirmedAt: { gte: start, lt: end } },
      _sum: { amountXaf: true },
      _count: { _all: true },
    }),
    accountFlow("platform_revenue", start, end),
    accountFlow("tax_payable", start, end),
    db.refund.aggregate({
      where: { status: "COMPLETED", processedAt: { gte: start, lt: end } },
      _sum: { amountXaf: true },
    }),
    db.refund.aggregate({
      where: { status: { in: ["REQUESTED", "PENDING_APPROVAL", "APPROVED", "PROCESSING"] } },
      _sum: { amountXaf: true },
      _count: { _all: true },
    }),
    db.ownerPayout.aggregate({
      where: { status: "PAID", paidAt: { gte: start, lt: end } },
      _sum: { amountXaf: true },
    }),
    db.ownerPayout.aggregate({
      where: { status: { in: ["PENDING_APPROVAL", "APPROVED", "PROCESSING"] } },
      _sum: { amountXaf: true },
      _count: { _all: true },
    }),
    db.expense.aggregate({
      where: { status: "ALLOCATED", approvedAt: { gte: start, lt: end } },
      _sum: { amountXaf: true },
    }),
    accountBalance("customer_deposits_held"),
    db.ledgerAccount.findMany({
      where: { kind: "OWNER_PAYABLE" },
      select: { id: true, key: true, ownerProfileId: true },
    }),
    db.ledgerEntry.count({ where: { effectiveAt: { gte: start, lt: end } } }),
    db.ledgerEntry.findMany({
      orderBy: { createdAt: "desc" },
      take: 15,
      include: {
        debitAccount: { select: { key: true } },
        creditAccount: { select: { key: true } },
        booking: { select: { reference: true } },
      },
    }),
  ]);
  let payable = 0;
  for (const a of ownerPayables) payable += await accountBalance(a.key);
  return {
    period: key,
    collectedXaf: collected._sum.amountXaf ?? 0,
    paymentsCount: collected._count._all,
    revenueXaf: revenue.credits - revenue.debits,
    taxXaf: tax.credits - tax.debits,
    refundsDoneXaf: refundsDone._sum.amountXaf ?? 0,
    refundsPendingXaf: refundsPending._sum.amountXaf ?? 0,
    refundsPendingCount: refundsPending._count._all,
    payoutsPaidXaf: payoutsPaid._sum.amountXaf ?? 0,
    payoutsPendingXaf: payoutsPending._sum.amountXaf ?? 0,
    payoutsPendingCount: payoutsPending._count._all,
    expensesXaf: expensesAllocated._sum.amountXaf ?? 0,
    depositsHeldXaf: depositsHeld,
    ownerPayablesXaf: payable,
    ledgerCount,
    recent,
  };
}

export async function listLedgerEntries(
  filter: { type?: LedgerEntryType | "ALL"; ownerProfileId?: string; month?: string; page: number },
  pageSize = 50,
) {
  const { start, end } = filter.month
    ? monthRange(filter.month)
    : { start: undefined, end: undefined };
  const where = {
    ...(filter.type && filter.type !== "ALL" ? { type: filter.type } : {}),
    ...(filter.ownerProfileId ? { ownerProfileId: filter.ownerProfileId } : {}),
    ...(start && end ? { effectiveAt: { gte: start, lt: end } } : {}),
  };
  const [total, entries] = await Promise.all([
    db.ledgerEntry.count({ where }),
    db.ledgerEntry.findMany({
      where,
      orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }],
      skip: (filter.page - 1) * pageSize,
      take: pageSize,
      include: {
        debitAccount: { select: { key: true } },
        creditAccount: { select: { key: true } },
        booking: { select: { reference: true } },
        ownerProfile: { select: { displayName: true } },
      },
    }),
  ]);
  return { total, entries, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function listOwnerBalances() {
  const accounts = await db.ledgerAccount.findMany({
    where: { kind: "OWNER_PAYABLE", ownerProfileId: { not: null } },
    include: {},
  });
  const out = [];
  for (const a of accounts) {
    const owner = await db.ownerProfile.findUnique({
      where: { id: a.ownerProfileId! },
      select: {
        id: true,
        displayName: true,
        payoutMethod: true,
        user: { select: { email: true } },
      },
    });
    if (!owner) continue;
    const balance = await accountBalance(a.key);
    out.push({ owner, balanceXaf: balance });
  }
  return out.sort((x, y) => y.balanceXaf - x.balanceXaf);
}

// ─── Report row builders (CSV) ───────────────────────────────────────────────

export const REPORT_KEYS = [
  "bookings",
  "payments",
  "refunds",
  "payouts",
  "expenses",
  "ledger",
  "statements",
] as const;
export type ReportKey = (typeof REPORT_KEYS)[number];

export async function reportRows(
  report: ReportKey,
  from: Date,
  to: Date,
): Promise<Array<Record<string, unknown>>> {
  switch (report) {
    case "bookings":
      return (
        await db.booking.findMany({
          where: { createdAt: { gte: from, lt: to } },
          orderBy: { createdAt: "asc" },
          include: {
            vehicle: {
              select: { registrationNumber: true, make: true, model: true, ownershipModel: true },
            },
            customer: { select: { email: true } },
            priceSnapshots: { orderBy: { sequence: "desc" }, take: 1 },
          },
        })
      ).map((b) => ({
        reference: b.reference,
        status: b.status,
        type: b.type,
        created_at: b.createdAt,
        start_at: b.startAt,
        end_at: b.endAt,
        rental_days: b.rentalDays,
        vehicle: `${b.vehicle.make} ${b.vehicle.model}`,
        plate: b.vehicle.registrationNumber,
        ownership: b.vehicle.ownershipModel,
        customer_email: b.customer.email,
        total_rental_xaf: b.priceSnapshots[0]?.totalRentalXaf ?? 0,
        deposit_xaf: b.priceSnapshots[0]?.securityDepositXaf ?? 0,
        commission_xaf: b.priceSnapshots[0]?.commissionXaf ?? 0,
        owner_share_xaf: b.priceSnapshots[0]?.ownerShareXaf ?? 0,
        cancellation_fee_xaf: b.cancellationFeeXaf ?? 0,
      }));
    case "payments":
      return (
        await db.payment.findMany({
          where: { createdAt: { gte: from, lt: to } },
          orderBy: { createdAt: "asc" },
          include: { booking: { select: { reference: true } } },
        })
      ).map((p) => ({
        id: p.id,
        booking: p.booking?.reference ?? "",
        purpose: p.purpose,
        method: p.method,
        provider: p.provider,
        environment: p.providerEnvironment ?? "",
        status: p.status,
        amount_xaf: p.amountXaf,
        deposit_xaf: p.depositXaf,
        refunded_xaf: p.refundedXaf,
        provider_reference: p.providerReference ?? "",
        created_at: p.createdAt,
        confirmed_at: p.confirmedAt ?? "",
        reconciled_at: p.reconciledAt ?? "",
      }));
    case "refunds":
      return (
        await db.refund.findMany({
          where: { createdAt: { gte: from, lt: to } },
          orderBy: { createdAt: "asc" },
          include: {
            booking: { select: { reference: true } },
            payment: { select: { method: true } },
            requestedBy: { select: { name: true } },
          },
        })
      ).map((r) => ({
        id: r.id,
        booking: r.booking?.reference ?? "",
        method: r.payment.method,
        status: r.status,
        amount_xaf: r.amountXaf,
        reason: r.reason,
        dual_approval: r.requiresDualApproval,
        requested_by: r.requestedBy?.name ?? "system",
        created_at: r.createdAt,
        processed_at: r.processedAt ?? "",
        provider_reference: r.providerReference ?? "",
      }));
    case "payouts":
      return (
        await db.ownerPayout.findMany({
          where: { createdAt: { gte: from, lt: to } },
          orderBy: { createdAt: "asc" },
          include: { ownerProfile: { select: { displayName: true } } },
        })
      ).map((p) => ({
        id: p.id,
        owner: p.ownerProfile.displayName,
        status: p.status,
        method: p.method,
        amount_xaf: p.amountXaf,
        period_start: p.periodStart,
        period_end: p.periodEnd,
        destination: p.destinationMasked ?? "",
        dual_approval: p.requiresDualApproval,
        created_at: p.createdAt,
        paid_at: p.paidAt ?? "",
        provider_reference: p.providerReference ?? "",
      }));
    case "expenses":
      return (
        await db.expense.findMany({
          where: { createdAt: { gte: from, lt: to } },
          orderBy: { createdAt: "asc" },
          include: {
            vehicle: { select: { registrationNumber: true } },
            ownerProfile: { select: { displayName: true } },
          },
        })
      ).map((e) => ({
        id: e.id,
        plate: e.vehicle.registrationNumber,
        owner: e.ownerProfile?.displayName ?? "",
        category: e.category,
        description: e.description,
        status: e.status,
        allocation: e.allocation,
        amount_xaf: e.amountXaf,
        owner_share_xaf: e.ownerShareXaf,
        ridekmer_share_xaf: e.ridekmerShareXaf,
        incurred_on: e.incurredOn,
        approved_at: e.approvedAt ?? "",
      }));
    case "ledger":
      return (
        await db.ledgerEntry.findMany({
          where: { effectiveAt: { gte: from, lt: to } },
          orderBy: [{ effectiveAt: "asc" }, { createdAt: "asc" }],
          include: {
            debitAccount: { select: { key: true } },
            creditAccount: { select: { key: true } },
            booking: { select: { reference: true } },
          },
        })
      ).map((l) => ({
        id: l.id,
        effective_at: l.effectiveAt,
        type: l.type,
        debit: l.debitAccount.key,
        credit: l.creditAccount.key,
        amount_xaf: l.amountXaf,
        booking: l.booking?.reference ?? "",
        description: l.description,
        idempotency_key: l.idempotencyKey,
      }));
    case "statements":
      return (
        await db.ownerStatement.findMany({
          where: { periodStart: { gte: from, lt: to } },
          orderBy: { periodStart: "asc" },
          include: { ownerProfile: { select: { displayName: true } } },
        })
      ).map((s) => ({
        key: s.key,
        owner: s.ownerProfile.displayName,
        period_start: s.periodStart,
        period_end: s.periodEnd,
        status: s.status,
        opening_xaf: s.openingBalanceXaf,
        earnings_xaf: s.earningsXaf,
        deductions_xaf: s.deductionsXaf,
        refunds_xaf: s.refundsXaf,
        expenses_xaf: s.expensesXaf,
        payouts_xaf: s.payoutsXaf,
        closing_xaf: s.closingBalanceXaf,
        entries: s.entryCount,
        issued_at: s.issuedAt,
      }));
  }
}
