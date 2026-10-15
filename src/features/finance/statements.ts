import { addMonths, startOfMonth } from "date-fns";

import { formatIsoDate } from "@/lib/dates";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/server/audit";
import { db } from "@/server/db";

import type { Prisma } from "@/generated/prisma/client";
import type { LedgerEntryType } from "@/generated/prisma/enums";

import { accountBalance } from "./ledger";
import { ownerPayableKey } from "./postings";

export interface StatementLine {
  date: string;
  type: LedgerEntryType;
  description: string;
  reference: string | null;
  creditXaf: number;
  debitXaf: number;
  balanceXaf: number;
}

export interface StatementSummary {
  openingBalanceXaf: number;
  earningsXaf: number;
  deductionsXaf: number;
  refundsXaf: number;
  expensesXaf: number;
  payoutsXaf: number;
  closingBalanceXaf: number;
  lines: StatementLine[];
}

const EARNING_TYPES: LedgerEntryType[] = ["OWNER_EARNING", "DAMAGE_DEDUCTION", "FEE", "ADJUSTMENT"];

/** Pure: build the statement from the owner's ledger entries in period order. */
export function buildStatement(
  openingBalanceXaf: number,
  entries: Array<{
    effectiveAt: Date;
    type: LedgerEntryType;
    description: string;
    amountXaf: number;
    /** True when the owner payable account is credited (owner earns), false when debited. */
    credit: boolean;
    reference: string | null;
  }>,
): StatementSummary {
  let balance = openingBalanceXaf;
  const summary: StatementSummary = {
    openingBalanceXaf,
    earningsXaf: 0,
    deductionsXaf: 0,
    refundsXaf: 0,
    expensesXaf: 0,
    payoutsXaf: 0,
    closingBalanceXaf: openingBalanceXaf,
    lines: [],
  };
  for (const e of entries) {
    balance += e.credit ? e.amountXaf : -e.amountXaf;
    if (e.credit && EARNING_TYPES.includes(e.type)) summary.earningsXaf += e.amountXaf;
    else if (e.type === "REFUND") summary.refundsXaf += e.amountXaf;
    else if (e.type === "MAINTENANCE_DEDUCTION") summary.expensesXaf += e.amountXaf;
    else if (e.type === "PAYOUT") summary.payoutsXaf += e.amountXaf;
    else if (!e.credit) summary.deductionsXaf += e.amountXaf;
    summary.lines.push({
      date: formatIsoDate(e.effectiveAt),
      type: e.type,
      description: e.description,
      reference: e.reference,
      creditXaf: e.credit ? e.amountXaf : 0,
      debitXaf: e.credit ? 0 : e.amountXaf,
      balanceXaf: balance,
    });
  }
  summary.closingBalanceXaf = balance;
  return summary;
}

export function statementKey(ownerProfileId: string, periodStart: Date) {
  return `${ownerProfileId}:${formatIsoDate(periodStart).slice(0, 7)}`;
}

/** Generate (or regenerate while DRAFT) an owner's statement for a calendar month. */
export async function generateOwnerStatement(
  ownerProfileId: string,
  periodStart: Date,
  actorId?: string | null,
) {
  const start = startOfMonth(periodStart);
  const end = addMonths(start, 1);
  const key = statementKey(ownerProfileId, start);
  const existing = await db.ownerStatement.findUnique({ where: { key } });
  if (existing?.status === "ISSUED") return existing;
  const account = await db.ledgerAccount.findUnique({
    where: { key: ownerPayableKey(ownerProfileId) },
    select: { id: true },
  });
  const opening = await accountBalance(ownerPayableKey(ownerProfileId), start);
  const entries = account
    ? await db.ledgerEntry.findMany({
        where: {
          OR: [{ creditAccountId: account.id }, { debitAccountId: account.id }],
          effectiveAt: { gte: start, lt: end },
        },
        orderBy: [{ effectiveAt: "asc" }, { createdAt: "asc" }],
        include: { booking: { select: { reference: true } } },
      })
    : [];
  const summary = buildStatement(
    opening,
    entries.map((e) => ({
      effectiveAt: e.effectiveAt,
      type: e.type,
      description: e.description,
      amountXaf: e.amountXaf,
      credit: e.creditAccountId === account?.id,
      reference: e.booking?.reference ?? null,
    })),
  );
  const data = {
    ownerProfileId,
    key,
    periodStart: start,
    periodEnd: end,
    status: "ISSUED" as const,
    openingBalanceXaf: summary.openingBalanceXaf,
    earningsXaf: summary.earningsXaf,
    deductionsXaf: summary.deductionsXaf,
    refundsXaf: summary.refundsXaf,
    expensesXaf: summary.expensesXaf,
    payoutsXaf: summary.payoutsXaf,
    closingBalanceXaf: summary.closingBalanceXaf,
    lines: summary.lines as unknown as Prisma.InputJsonValue,
    entryCount: summary.lines.length,
    issuedAt: new Date(),
  };
  const statement = existing
    ? await db.ownerStatement.update({ where: { id: existing.id }, data })
    : await db.ownerStatement.create({ data });
  await recordAudit({
    actorId: actorId ?? null,
    actorType: actorId ? "USER" : "CRON",
    action: "statement.issue",
    entityType: "OwnerStatement",
    entityId: statement.id,
    after: { ownerProfileId, period: key, closingBalanceXaf: statement.closingBalanceXaf },
  });
  return statement;
}

/** Monthly cron: issue last month's statement for every owner with a payable account. */
export async function issueMonthlyStatements(now = new Date()) {
  const periodStart = startOfMonth(addMonths(now, -1));
  const owners = await db.ledgerAccount.findMany({
    where: { kind: "OWNER_PAYABLE", ownerProfileId: { not: null } },
    select: { ownerProfileId: true },
  });
  let issued = 0;
  for (const o of owners) {
    try {
      await generateOwnerStatement(o.ownerProfileId!, periodStart);
      issued += 1;
    } catch (error) {
      logger.error("statement.issue_failed", { ownerProfileId: o.ownerProfileId, error });
    }
  }
  logger.info("cron.statements", { period: formatIsoDate(periodStart).slice(0, 7), issued });
  return { period: formatIsoDate(periodStart).slice(0, 7), issued };
}

export async function listStatementsForOwner(ownerProfileId: string) {
  return db.ownerStatement.findMany({
    where: { ownerProfileId },
    orderBy: { periodStart: "desc" },
  });
}

export async function getStatementForOwner(id: string, ownerProfileId: string) {
  const statement = await db.ownerStatement.findUnique({ where: { id } });
  if (!statement || statement.ownerProfileId !== ownerProfileId) return null;
  return statement;
}

export function statementCsvRows(statement: { lines: unknown }) {
  return (statement.lines as StatementLine[]).map((l) => ({
    date: l.date,
    type: l.type,
    reference: l.reference ?? "",
    description: l.description,
    credit_xaf: l.creditXaf,
    debit_xaf: l.debitXaf,
    balance_xaf: l.balanceXaf,
  }));
}
