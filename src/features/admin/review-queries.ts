import { db } from "@/server/db";

import type { VehicleStatus } from "@/generated/prisma/enums";

export const REVIEWABLE_STATUSES: VehicleStatus[] = ["SUBMITTED", "UNDER_REVIEW"];

export async function listVehiclesForAdmin(
  filter: { status?: VehicleStatus | "ALL"; q?: string; page: number },
  pageSize = 25,
) {
  const where = {
    deletedAt: null,
    ...(filter.status && filter.status !== "ALL" ? { status: filter.status } : {}),
    ...(filter.q
      ? {
          OR: [
            { registrationNumber: { contains: filter.q, mode: "insensitive" as const } },
            { make: { contains: filter.q, mode: "insensitive" as const } },
            { model: { contains: filter.q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const [total, vehicles, counts] = await Promise.all([
    db.vehicle.count({ where }),
    db.vehicle.findMany({
      where,
      orderBy: [{ submittedAt: "asc" }, { createdAt: "desc" }],
      skip: (filter.page - 1) * pageSize,
      take: pageSize,
      include: {
        city: true,
        ownerProfile: { select: { displayName: true, kycApprovedAt: true } },
        documents: { where: { status: { not: "REPLACED" } }, select: { status: true } },
      },
    }),
    db.vehicle.groupBy({ by: ["status"], _count: { _all: true }, where: { deletedAt: null } }),
  ]);
  return {
    total,
    vehicles,
    pages: Math.max(1, Math.ceil(total / pageSize)),
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])) as Partial<
      Record<VehicleStatus, number>
    >,
  };
}

export async function getVehicleForAdmin(id: string) {
  return db.vehicle.findUnique({
    where: { id },
    include: {
      city: true,
      branch: true,
      managementConfig: true,
      images: { orderBy: { sortOrder: "asc" } },
      documents: {
        where: { status: { not: "REPLACED" } },
        include: { documentType: true, reviewer: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      },
      documentOverrides: {
        orderBy: { createdAt: "desc" },
        include: { createdBy: { select: { name: true } } },
      },
      availabilityBlocks: { orderBy: { startAt: "asc" } },
      ownerProfile: {
        include: {
          user: { select: { id: true, name: true, email: true, phoneNumber: true } },
          company: true,
        },
      },
      reviewer: { select: { name: true } },
    },
  });
}

/** Documents awaiting review across vehicles and verification cases. */
export async function listDocumentQueue() {
  const [vehicleDocs, verificationDocs] = await Promise.all([
    db.vehicleDocument.findMany({
      where: { status: { in: ["SUBMITTED", "UNDER_REVIEW"] } },
      orderBy: { createdAt: "asc" },
      include: {
        documentType: true,
        vehicle: { select: { id: true, registrationNumber: true, make: true, model: true } },
      },
      take: 100,
    }),
    db.verificationDocument.findMany({
      where: { status: { in: ["SUBMITTED", "UNDER_REVIEW"] } },
      orderBy: { createdAt: "asc" },
      include: {
        documentType: true,
        verificationCase: {
          include: {
            customerProfile: { include: { user: { select: { name: true, email: true } } } },
            ownerProfile: { select: { id: true, displayName: true } },
          },
        },
      },
      take: 100,
    }),
  ]);
  return { vehicleDocs, verificationDocs };
}

export async function listVerificationCases(
  status: "SUBMITTED" | "UNDER_REVIEW" | "APPROVED" | "REJECTED" | "ALL",
) {
  return db.verificationCase.findMany({
    where: status === "ALL" ? {} : { status },
    orderBy: { submittedAt: "asc" },
    include: {
      documents: { where: { status: { not: "REPLACED" } }, include: { documentType: true } },
      customerProfile: { include: { user: { select: { id: true, name: true, email: true } } } },
      ownerProfile: {
        include: { user: { select: { id: true, name: true, email: true } }, company: true },
      },
    },
    take: 100,
  });
}

export async function getVerificationCase(id: string) {
  return db.verificationCase.findUnique({
    where: { id },
    include: {
      documents: {
        where: { status: { not: "REPLACED" } },
        include: { documentType: true, reviewer: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      },
      customerProfile: {
        include: { user: { select: { id: true, name: true, email: true, phoneNumber: true } } },
      },
      ownerProfile: {
        include: {
          user: { select: { id: true, name: true, email: true, phoneNumber: true } },
          company: true,
        },
      },
      reviewer: { select: { name: true } },
    },
  });
}
