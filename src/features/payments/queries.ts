import { db } from "@/server/db";

import type { PaymentMethod, PaymentStatus } from "@/generated/prisma/enums";

export async function listPaymentsForAdmin(
  filter: {
    status?: PaymentStatus | "ALL";
    method?: PaymentMethod | "ALL";
    q?: string;
    page: number;
  },
  pageSize = 25,
) {
  const where = {
    ...(filter.status && filter.status !== "ALL" ? { status: filter.status } : {}),
    ...(filter.method && filter.method !== "ALL" ? { method: filter.method } : {}),
    ...(filter.q
      ? {
          OR: [
            { booking: { reference: { contains: filter.q.toUpperCase() } } },
            { providerReference: { contains: filter.q, mode: "insensitive" as const } },
            {
              booking: {
                customer: { email: { contains: filter.q, mode: "insensitive" as const } },
              },
            },
          ],
        }
      : {}),
  };
  const [total, payments, counts] = await Promise.all([
    db.payment.count({ where }),
    db.payment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (filter.page - 1) * pageSize,
      take: pageSize,
      include: {
        booking: { select: { id: true, reference: true, customer: { select: { name: true } } } },
      },
    }),
    db.payment.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  return {
    total,
    payments,
    pages: Math.max(1, Math.ceil(total / pageSize)),
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])) as Partial<
      Record<PaymentStatus, number>
    >,
  };
}

export async function getPaymentForAdmin(id: string) {
  return db.payment.findUnique({
    where: { id },
    include: {
      booking: {
        select: {
          id: true,
          reference: true,
          status: true,
          customer: { select: { id: true, name: true, email: true } },
        },
      },
      recordedBy: { select: { name: true } },
      attempts: { orderBy: { attemptNumber: "asc" } },
      webhookEvents: { orderBy: { receivedAt: "desc" }, take: 20 },
      refunds: {
        orderBy: { createdAt: "desc" },
        include: { requestedBy: { select: { name: true } } },
      },
    },
  });
}

export async function listApprovalsForRefunds(refundIds: string[]) {
  if (refundIds.length === 0) return [];
  return db.approval.findMany({
    where: { subjectType: "REFUND", subjectId: { in: refundIds } },
    include: { approver: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
}
