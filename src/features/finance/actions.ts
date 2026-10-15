"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { fromDoualaLocal } from "@/lib/dates";
import { getCurrentSession, requirePermissionOrThrow } from "@/server/auth/session";
import { db } from "@/server/db";

import { ExpenseError, decideExpense } from "./expenses";
import { postManualAdjustment, postMissingLedgerEntries } from "./ledger";
import { PayoutError, decidePayout, markPayoutPaid, processPayout, requestPayout } from "./payouts";
import { generateOwnerStatement } from "./statements";

export interface FinanceActionResult {
  ok: boolean;
  message?: string;
}

function fail(error: unknown): FinanceActionResult {
  if (error instanceof PayoutError || error instanceof ExpenseError)
    return { ok: false, message: error.code };
  if (error instanceof Error && error.message === "INVALID_AMOUNT")
    return { ok: false, message: "AMOUNT_INVALID" };
  throw error;
}

function revalidate() {
  revalidatePath("/[locale]/admin/finance", "layout");
  revalidatePath("/[locale]/admin/payouts", "layout");
  revalidatePath("/[locale]/admin/expenses", "layout");
  revalidatePath("/[locale]/owner/finance", "layout");
}

const payoutSchema = z.object({
  ownerProfileId: z.string().min(1),
  amountXaf: z.coerce.number().int().positive(),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function requestPayoutAction(
  _prev: FinanceActionResult,
  formData: FormData,
): Promise<FinanceActionResult> {
  const current = await getCurrentSession();
  if (!current) return { ok: false, message: "UNAUTHENTICATED" };
  const parsed = payoutSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, message: "INVALID" };
  const asOwner = formData.get("asOwner") === "1";
  try {
    if (asOwner) {
      const profile = await db.ownerProfile.findUnique({
        where: { userId: current.user.id },
        select: { id: true },
      });
      if (!profile || profile.id !== parsed.data.ownerProfileId)
        return { ok: false, message: "FORBIDDEN" };
    } else {
      await requirePermissionOrThrow("payout.request");
    }
    await requestPayout({
      ownerProfileId: parsed.data.ownerProfileId,
      amountXaf: parsed.data.amountXaf,
      periodStart: fromDoualaLocal(`${parsed.data.periodStart}T00:00`),
      periodEnd: fromDoualaLocal(`${parsed.data.periodEnd}T00:00`),
      requestedById: current.user.id,
      asOwner,
    });
    revalidate();
    return { ok: true, message: "PAYOUT_REQUESTED" };
  } catch (error) {
    return fail(error);
  }
}

export async function decidePayoutAction(
  _prev: FinanceActionResult,
  formData: FormData,
): Promise<FinanceActionResult> {
  const { user } = await requirePermissionOrThrow("payout.approve");
  const decision = formData.get("decision") === "REJECTED" ? "REJECTED" : "APPROVED";
  try {
    const payout = await decidePayout({
      payoutId: String(formData.get("payoutId") ?? ""),
      approverId: user.id,
      decision,
      comment:
        String(formData.get("comment") ?? "")
          .trim()
          .slice(0, 500) || null,
    });
    revalidate();
    return { ok: true, message: `PAYOUT_${payout.status}` };
  } catch (error) {
    return fail(error);
  }
}

export async function processPayoutAction(
  _prev: FinanceActionResult,
  formData: FormData,
): Promise<FinanceActionResult> {
  const { user } = await requirePermissionOrThrow("payout.process");
  try {
    const payout = await processPayout(String(formData.get("payoutId") ?? ""), user.id);
    revalidate();
    return { ok: true, message: `PAYOUT_${payout.status}` };
  } catch (error) {
    return fail(error);
  }
}

export async function markPayoutPaidAction(
  _prev: FinanceActionResult,
  formData: FormData,
): Promise<FinanceActionResult> {
  const { user } = await requirePermissionOrThrow("payout.process");
  const reference = String(formData.get("reference") ?? "").trim();
  if (reference.length < 3) return { ok: false, message: "INVALID" };
  try {
    await markPayoutPaid(String(formData.get("payoutId") ?? ""), reference, user.id);
    revalidate();
    return { ok: true, message: "PAYOUT_PAID" };
  } catch (error) {
    return fail(error);
  }
}

const expenseSchema = z.object({
  expenseId: z.string().min(1),
  decision: z.enum(["ALLOCATE", "REJECT"]),
  allocation: z.enum(["OWNER", "RIDEKMER", "CUSTOMER", "SHARED"]).optional(),
  ownerShareXaf: z.coerce.number().int().min(0).optional(),
  note: z.string().trim().max(500).optional(),
});

export async function decideExpenseAction(
  _prev: FinanceActionResult,
  formData: FormData,
): Promise<FinanceActionResult> {
  const { user } = await requirePermissionOrThrow("expense.approve");
  const raw = Object.fromEntries([...formData.entries()].filter(([, v]) => v !== ""));
  const parsed = expenseSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: "INVALID" };
  try {
    await decideExpense({ ...parsed.data, actorId: user.id });
    revalidate();
    return {
      ok: true,
      message: parsed.data.decision === "ALLOCATE" ? "EXPENSE_ALLOCATED" : "EXPENSE_REJECTED",
    };
  } catch (error) {
    return fail(error);
  }
}

export async function adjustmentAction(
  _prev: FinanceActionResult,
  formData: FormData,
): Promise<FinanceActionResult> {
  const { user } = await requirePermissionOrThrow("ledger.view");
  const parsed = z
    .object({
      ownerProfileId: z.string().min(1),
      amountXaf: z.coerce.number().int(),
      reason: z.string().trim().min(5).max(300),
    })
    .safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, message: "INVALID" };
  try {
    await postManualAdjustment({ ...parsed.data, actorId: user.id });
    revalidate();
    return { ok: true, message: "ADJUSTED" };
  } catch (error) {
    return fail(error);
  }
}

export async function issueStatementAction(
  _prev: FinanceActionResult,
  formData: FormData,
): Promise<FinanceActionResult> {
  const { user } = await requirePermissionOrThrow("ledger.view");
  const parsed = z
    .object({ ownerProfileId: z.string().min(1), month: z.string().regex(/^\d{4}-\d{2}$/) })
    .safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, message: "INVALID" };
  await generateOwnerStatement(
    parsed.data.ownerProfileId,
    new Date(`${parsed.data.month}-01T00:00:00Z`),
    user.id,
  );
  revalidate();
  return { ok: true, message: "STATEMENT_ISSUED" };
}

export async function ledgerCatchUpAction(
  _prev: FinanceActionResult,
  _formData: FormData,
): Promise<FinanceActionResult> {
  await requirePermissionOrThrow("payment.reconcile");
  const result = await postMissingLedgerEntries();
  revalidate();
  return { ok: true, message: `CATCH_UP:${result.posted}` };
}
