/**
 * Pure posting rules for the double-entry ledger. Everything is integer XAF. Each rule
 * returns the list of (type, debit, credit, amount) lines for one business event so the
 * rules are unit-testable without a database. Account keys:
 *   platform_cash, customer_deposits_held, platform_revenue, tax_payable, fees_receivable,
 *   adjustments, payout_clearing, owner_payable:<ownerProfileId>
 */
import type { LedgerEntryType } from "@/generated/prisma/enums";

export interface PostingLine {
  type: LedgerEntryType;
  debit: string;
  credit: string;
  amountXaf: number;
  description: string;
}

export const ownerPayableKey = (ownerProfileId: string) => `owner_payable:${ownerProfileId}`;

function line(
  type: LedgerEntryType,
  debit: string,
  credit: string,
  amountXaf: number,
  description: string,
): PostingLine | null {
  if (!Number.isInteger(amountXaf) || amountXaf <= 0) return null;
  return { type, debit, credit, amountXaf, description };
}

function compact(lines: Array<PostingLine | null>): PostingLine[] {
  return lines.filter((l): l is PostingLine => l !== null);
}

export interface RentalPaymentInput {
  reference: string;
  amountXaf: number;
  depositXaf: number;
  /** From the price snapshot. */
  totalRentalXaf: number;
  ownerShareXaf: number;
  taxXaf: number;
  ownerProfileId: string | null;
}

/** A successful rental payment: deposit is a liability; the rental splits into owner, tax and revenue. */
export function rentalPaymentPostings(p: RentalPaymentInput): PostingLine[] {
  const rentalPaid = Math.max(0, p.amountXaf - p.depositXaf);
  // Guard against snapshot drift: never allocate more than what was actually paid.
  const owner = p.ownerProfileId ? Math.min(p.ownerShareXaf, rentalPaid) : 0;
  const tax = Math.min(p.taxXaf, Math.max(0, rentalPaid - owner));
  const revenue = Math.max(0, rentalPaid - owner - tax);
  return compact([
    line(
      "SECURITY_DEPOSIT",
      "platform_cash",
      "customer_deposits_held",
      Math.min(p.depositXaf, p.amountXaf),
      `Deposit held ${p.reference}`,
    ),
    p.ownerProfileId
      ? line(
          "OWNER_EARNING",
          "platform_cash",
          ownerPayableKey(p.ownerProfileId),
          owner,
          `Owner share ${p.reference}`,
        )
      : null,
    line("TAX", "platform_cash", "tax_payable", tax, `Tax ${p.reference}`),
    line(
      "PLATFORM_COMMISSION",
      "platform_cash",
      "platform_revenue",
      revenue,
      `Commission and fees ${p.reference}`,
    ),
  ]);
}

/** Additional charges collected after return (extra km, fuel, late days, damage) are revenue. */
export function additionalChargePostings(reference: string, amountXaf: number): PostingLine[] {
  return compact([
    line("FEE", "platform_cash", "platform_revenue", amountXaf, `Additional charge ${reference}`),
  ]);
}

export interface RefundInput {
  reference: string;
  refundXaf: number;
  /** Deposit component of the refunded payment and how much of it this refund returns. */
  depositPortionXaf: number;
  /** Rental part of the refund (refundXaf − depositPortionXaf). */
  ownerShareXaf: number;
  totalRentalXaf: number;
  ownerProfileId: string | null;
}

/**
 * A completed refund: the deposit part reverses the liability; the rental part is shared
 * between the owner and the platform in the same proportion as the original earning.
 */
export function refundPostings(r: RefundInput): PostingLine[] {
  const depositBack = Math.min(r.depositPortionXaf, r.refundXaf);
  const rentalBack = r.refundXaf - depositBack;
  const ownerPart =
    r.ownerProfileId && r.totalRentalXaf > 0
      ? Math.min(rentalBack, Math.round((rentalBack * r.ownerShareXaf) / r.totalRentalXaf))
      : 0;
  const platformPart = rentalBack - ownerPart;
  return compact([
    line(
      "DEPOSIT_REFUND",
      "customer_deposits_held",
      "platform_cash",
      depositBack,
      `Deposit refund ${r.reference}`,
    ),
    r.ownerProfileId
      ? line(
          "REFUND",
          ownerPayableKey(r.ownerProfileId),
          "platform_cash",
          ownerPart,
          `Refund (owner share) ${r.reference}`,
        )
      : null,
    line(
      "REFUND",
      "platform_revenue",
      "platform_cash",
      platformPart,
      `Refund (platform share) ${r.reference}`,
    ),
  ]);
}

export interface DepositRetentionInput {
  reference: string;
  retainedXaf: number;
  damageXaf: number;
  ownerShareBps: number;
  ownerProfileId: string | null;
}

/**
 * Deposit retained at settlement: damage goes to the owner (vehicle repair) net of commission,
 * other charges (fuel, km, late) follow the same split as rental income.
 */
export function depositRetentionPostings(d: DepositRetentionInput): PostingLine[] {
  const damage = Math.min(d.damageXaf, d.retainedXaf);
  const other = d.retainedXaf - damage;
  const ownerDamage = d.ownerProfileId ? Math.round((damage * d.ownerShareBps) / 10_000) : 0;
  const ownerOther = d.ownerProfileId ? Math.round((other * d.ownerShareBps) / 10_000) : 0;
  return compact([
    d.ownerProfileId
      ? line(
          "DAMAGE_DEDUCTION",
          "customer_deposits_held",
          ownerPayableKey(d.ownerProfileId),
          ownerDamage,
          `Damage deduction (owner) ${d.reference}`,
        )
      : null,
    line(
      "DAMAGE_DEDUCTION",
      "customer_deposits_held",
      "platform_revenue",
      damage - ownerDamage,
      `Damage deduction (platform) ${d.reference}`,
    ),
    d.ownerProfileId
      ? line(
          "FEE",
          "customer_deposits_held",
          ownerPayableKey(d.ownerProfileId),
          ownerOther,
          `Return charges (owner) ${d.reference}`,
        )
      : null,
    line(
      "FEE",
      "customer_deposits_held",
      "platform_revenue",
      other - ownerOther,
      `Return charges (platform) ${d.reference}`,
    ),
  ]);
}

export interface ExpenseInput {
  reference: string;
  ownerShareXaf: number;
  ridekmerShareXaf: number;
  ownerProfileId: string | null;
}

/** An allocated expense paid by RideKmer: the owner's share reduces what is owed to them. */
export function expensePostings(e: ExpenseInput): PostingLine[] {
  return compact([
    e.ownerProfileId
      ? line(
          "MAINTENANCE_DEDUCTION",
          ownerPayableKey(e.ownerProfileId),
          "platform_cash",
          e.ownerShareXaf,
          `Expense (owner share) ${e.reference}`,
        )
      : null,
    line(
      "MAINTENANCE_DEDUCTION",
      "platform_revenue",
      "platform_cash",
      e.ridekmerShareXaf,
      `Expense (RideKmer share) ${e.reference}`,
    ),
  ]);
}

export function payoutPostings(
  reference: string,
  ownerProfileId: string,
  amountXaf: number,
): PostingLine[] {
  return compact([
    line(
      "PAYOUT",
      ownerPayableKey(ownerProfileId),
      "platform_cash",
      amountXaf,
      `Payout ${reference}`,
    ),
  ]);
}

/** Sum of a posting set per account: positive = net credit. */
export function netByAccount(lines: PostingLine[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of lines) {
    out[l.credit] = (out[l.credit] ?? 0) + l.amountXaf;
    out[l.debit] = (out[l.debit] ?? 0) - l.amountXaf;
  }
  return out;
}
