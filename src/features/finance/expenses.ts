import { recordAudit } from "@/server/audit";
import { db } from "@/server/db";

import type { ExpenseAllocation, ExpenseStatus } from "@/generated/prisma/enums";

import { postExpenseEntries, tryPost } from "./ledger";

export class ExpenseError extends Error {
  constructor(
    public readonly code: "NOT_FOUND" | "INVALID_STATUS" | "INVALID",
    message?: string,
  ) {
    super(message ?? code);
    this.name = "ExpenseError";
  }
}

/** Finance decides who bears an expense; allocation posts it to the ledger. */
export async function decideExpense(input: {
  expenseId: string;
  actorId: string;
  decision: "ALLOCATE" | "REJECT";
  allocation?: ExpenseAllocation;
  ownerShareXaf?: number | null;
  note?: string | null;
}) {
  const expense = await db.expense.findUnique({
    where: { id: input.expenseId },
    include: { vehicle: { select: { ownershipModel: true, ownerProfileId: true } } },
  });
  if (!expense) throw new ExpenseError("NOT_FOUND");
  if (!["PENDING", "AWAITING_OWNER_APPROVAL", "APPROVED"].includes(expense.status))
    throw new ExpenseError("INVALID_STATUS");
  if (input.decision === "REJECT") {
    const rejected = await db.expense.update({
      where: { id: expense.id },
      data: { status: "REJECTED", approvedById: input.actorId, approvedAt: new Date() },
    });
    await recordAudit({
      actorId: input.actorId,
      action: "expense.reject",
      entityType: "Expense",
      entityId: expense.id,
      reason: input.note ?? null,
    });
    return rejected;
  }
  const hasOwner =
    expense.vehicle.ownershipModel !== "RIDEKMER_OWNED" && expense.vehicle.ownerProfileId;
  const allocation: ExpenseAllocation = hasOwner ? (input.allocation ?? "OWNER") : "RIDEKMER";
  let ownerShare = 0;
  if (allocation === "OWNER") ownerShare = expense.amountXaf;
  else if (allocation === "SHARED") {
    if (
      input.ownerShareXaf === undefined ||
      input.ownerShareXaf === null ||
      input.ownerShareXaf < 0 ||
      input.ownerShareXaf > expense.amountXaf
    )
      throw new ExpenseError("INVALID", "owner share required for SHARED");
    ownerShare = input.ownerShareXaf;
  } else if (allocation === "CUSTOMER") {
    // Customer-borne costs are collected through the booking settlement, not the owner ledger.
    ownerShare = 0;
  }
  const allocated = await db.expense.update({
    where: { id: expense.id },
    data: {
      status: "ALLOCATED",
      allocation,
      ownerProfileId: hasOwner ? expense.vehicle.ownerProfileId : null,
      ownerShareXaf: ownerShare,
      ridekmerShareXaf: allocation === "CUSTOMER" ? 0 : expense.amountXaf - ownerShare,
      customerShareXaf: allocation === "CUSTOMER" ? expense.amountXaf : 0,
      approvedById: input.actorId,
      approvedAt: new Date(),
    },
  });
  await recordAudit({
    actorId: input.actorId,
    action: "expense.allocate",
    entityType: "Expense",
    entityId: expense.id,
    after: { allocation, ownerShareXaf: ownerShare, amountXaf: expense.amountXaf },
    reason: input.note ?? null,
  });
  await tryPost(`expense:${allocated.id}`, () => postExpenseEntries(allocated.id));
  return allocated;
}

export async function listExpensesForAdmin(
  filter: { status?: ExpenseStatus | "ALL"; page: number },
  pageSize = 25,
) {
  const where = filter.status && filter.status !== "ALL" ? { status: filter.status } : {};
  const [total, expenses] = await Promise.all([
    db.expense.count({ where }),
    db.expense.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (filter.page - 1) * pageSize,
      take: pageSize,
      include: {
        vehicle: {
          select: {
            id: true,
            make: true,
            model: true,
            registrationNumber: true,
            ownershipModel: true,
          },
        },
        ownerProfile: { select: { displayName: true } },
        approvedBy: { select: { name: true } },
        maintenanceRecord: { select: { title: true } },
      },
    }),
  ]);
  return { total, expenses, pages: Math.max(1, Math.ceil(total / pageSize)) };
}
