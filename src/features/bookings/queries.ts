import { db } from "@/server/db";

import type { BookingStatus } from "@/generated/prisma/enums";

export async function listCustomerBookings(userId: string) {
  return db.booking.findMany({
    where: { customerId: userId },
    orderBy: { createdAt: "desc" },
    include: {
      vehicle: {
        select: {
          make: true,
          model: true,
          registrationNumber: true,
          city: { select: { nameFr: true, nameEn: true } },
        },
      },
      priceSnapshots: { orderBy: { sequence: "desc" }, take: 1 },
    },
  });
}

export async function listBookingsForAdmin(
  filter: { status?: BookingStatus | "ALL"; q?: string; page: number },
  pageSize = 25,
) {
  const where = {
    ...(filter.status && filter.status !== "ALL" ? { status: filter.status } : {}),
    ...(filter.q
      ? {
          OR: [
            { reference: { contains: filter.q.toUpperCase() } },
            { customer: { email: { contains: filter.q, mode: "insensitive" as const } } },
            {
              vehicle: { registrationNumber: { contains: filter.q, mode: "insensitive" as const } },
            },
          ],
        }
      : {}),
  };
  const [total, bookings, counts] = await Promise.all([
    db.booking.count({ where }),
    db.booking.findMany({
      where,
      orderBy: [{ startAt: "asc" }],
      skip: (filter.page - 1) * pageSize,
      take: pageSize,
      include: {
        customer: { select: { name: true, email: true } },
        vehicle: { select: { make: true, model: true, registrationNumber: true } },
        priceSnapshots: { orderBy: { sequence: "desc" }, take: 1 },
      },
    }),
    db.booking.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  return {
    total,
    bookings,
    pages: Math.max(1, Math.ceil(total / pageSize)),
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])) as Partial<
      Record<BookingStatus, number>
    >,
  };
}

export async function getBookingForAdmin(id: string) {
  return db.booking.findUnique({
    where: { id },
    include: {
      customer: {
        select: {
          id: true,
          name: true,
          email: true,
          phoneNumber: true,
          customerProfile: { select: { approvedAt: true } },
        },
      },
      vehicle: { include: { city: true, ownerProfile: { select: { displayName: true } } } },
      pickupBranch: true,
      priceSnapshots: { orderBy: { sequence: "desc" } },
      statusHistory: {
        orderBy: { createdAt: "asc" },
        include: { actor: { select: { name: true } } },
      },
      payments: true,
      hold: true,
    },
  });
}
