import { getPricingSettings } from "@/features/pricing/settings";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/server/audit";
import { db } from "@/server/db";
import { storeFile } from "@/server/files/service";

import type { Prisma } from "@/generated/prisma/client";
import type { DamageSeverity, InspectionType } from "@/generated/prisma/enums";

import { CHECK_AREAS, INSPECTION_PHOTO_MIME, type CheckGroup } from "./schemas";
import { computeSettlement, type Settlement } from "./settlement";

export class InspectionError extends Error {
  constructor(
    public readonly code:
      | "NOT_FOUND"
      | "FORBIDDEN"
      | "INVALID_STATUS"
      | "BOOKING_STATUS"
      | "DETAILS_REQUIRED"
      | "PHOTOS_REQUIRED"
      | "PICKUP_MISSING"
      | "ALREADY_SETTLED",
    message?: string,
  ) {
    super(message ?? code);
    this.name = "InspectionError";
  }
}

const REQUIRED_PHOTOS = 4;

/** Start (or resume) an inspection. One open draft per booking and type. */
export async function startInspection(input: {
  vehicleId: string;
  bookingId?: string | null;
  type: InspectionType;
  inspectorId: string;
  clientDraftId?: string | null;
}) {
  if (input.bookingId) {
    const booking = await db.booking.findUnique({ where: { id: input.bookingId } });
    if (!booking || booking.vehicleId !== input.vehicleId) throw new InspectionError("NOT_FOUND");
    const allowed =
      input.type === "PICKUP"
        ? ["CONFIRMED", "READY_FOR_PICKUP", "ACTIVE"]
        : input.type === "RETURN"
          ? ["ACTIVE", "EXTENSION_REQUESTED", "COMPLETED", "DISPUTED"]
          : null;
    if (allowed && !allowed.includes(booking.status)) throw new InspectionError("BOOKING_STATUS");
    const existing = await db.inspection.findFirst({
      where: { bookingId: input.bookingId, type: input.type, status: { not: "DISPUTED" } },
      orderBy: { createdAt: "desc" },
    });
    if (existing) return existing;
  }
  if (input.clientDraftId) {
    const byDraft = await db.inspection.findUnique({
      where: { clientDraftId: input.clientDraftId },
    });
    if (byDraft) return byDraft;
  }
  const inspection = await db.inspection.create({
    data: {
      vehicleId: input.vehicleId,
      bookingId: input.bookingId ?? null,
      type: input.type,
      status: "DRAFT",
      inspectorId: input.inspectorId,
      clientDraftId: input.clientDraftId ?? null,
    },
  });
  await recordAudit({
    actorId: input.inspectorId,
    action: "inspection.start",
    entityType: "Inspection",
    entityId: inspection.id,
    after: { vehicleId: input.vehicleId, bookingId: input.bookingId ?? null, type: input.type },
  });
  return inspection;
}

async function openInspection(id: string) {
  const inspection = await db.inspection.findUnique({ where: { id } });
  if (!inspection) throw new InspectionError("NOT_FOUND");
  if (inspection.status !== "DRAFT") throw new InspectionError("INVALID_STATUS");
  return inspection;
}

export async function saveInspectionDetails(input: {
  inspectionId: string;
  actorId: string;
  mileageKm: number;
  fuelLevelPercent: number;
  windscreenCondition: string;
  notes?: string;
  accessories?: string;
  documentsPresent?: string;
  checks: Partial<Record<CheckGroup, Record<string, string>>>;
}) {
  await openInspection(input.inspectionId);
  const clean = (group: CheckGroup) => {
    const allowed = CHECK_AREAS[group] as readonly string[];
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(input.checks[group] ?? {})) {
      if (allowed.includes(k)) out[k] = v;
    }
    return out;
  };
  return db.inspection.update({
    where: { id: input.inspectionId },
    data: {
      mileageKm: input.mileageKm,
      fuelLevelPercent: input.fuelLevelPercent,
      windscreenCondition: input.windscreenCondition,
      notes: input.notes ?? null,
      accessories: input.accessories ? { list: input.accessories } : undefined,
      documentsPresent: input.documentsPresent ? { list: input.documentsPresent } : undefined,
      exteriorCondition: clean("exterior"),
      interiorCondition: clean("interior"),
      tyresCondition: clean("tyres"),
      lightsCondition: clean("lights"),
    },
  });
}

export async function addInspectionPhoto(input: {
  inspectionId: string;
  actorId: string;
  file: File;
  area?: string | null;
  caption?: string | null;
}) {
  await openInspection(input.inspectionId);
  const stored = await storeFile({
    scope: "inspections",
    entityId: input.inspectionId,
    file: input.file,
    allowedMimeTypes: INSPECTION_PHOTO_MIME,
    actorId: input.actorId,
  });
  return db.inspectionPhoto.create({
    data: {
      inspectionId: input.inspectionId,
      storageKey: stored.storageKey,
      checksumSha256: stored.checksumSha256,
      area: input.area ?? null,
      caption: input.caption ?? null,
      takenAt: new Date(),
    },
  });
}

export async function addDamage(input: {
  inspectionId: string;
  actorId: string;
  diagramView: string;
  markerX: number;
  markerY: number;
  area: string;
  damageType: string;
  severity: DamageSeverity;
  description?: string;
  isPreExisting: boolean;
  estimateXaf?: number;
}) {
  const inspection = await openInspection(input.inspectionId);
  const damage = await db.vehicleDamage.create({
    data: {
      vehicleId: inspection.vehicleId,
      inspectionId: inspection.id,
      bookingId: inspection.bookingId,
      diagramView: input.diagramView,
      markerX: input.markerX,
      markerY: input.markerY,
      area: input.area,
      damageType: input.damageType,
      severity: input.severity,
      description: input.description ?? null,
      // Everything found at pickup is by definition pre-existing for this rental.
      isPreExisting: inspection.type === "PICKUP" ? true : input.isPreExisting,
      estimateXaf: input.estimateXaf ?? null,
    },
  });
  await recordAudit({
    actorId: input.actorId,
    action: "inspection.damage.add",
    entityType: "VehicleDamage",
    entityId: damage.id,
    after: {
      inspectionId: inspection.id,
      area: input.area,
      severity: input.severity,
      estimateXaf: input.estimateXaf ?? null,
    },
  });
  return damage;
}

export async function removeDamage(damageId: string, actorId: string) {
  const damage = await db.vehicleDamage.findUnique({
    where: { id: damageId },
    include: { inspection: true },
  });
  if (!damage?.inspection) throw new InspectionError("NOT_FOUND");
  if (damage.inspection.status !== "DRAFT") throw new InspectionError("INVALID_STATUS");
  await db.vehicleDamage.delete({ where: { id: damageId } });
  await recordAudit({
    actorId,
    action: "inspection.damage.remove",
    entityType: "VehicleDamage",
    entityId: damageId,
  });
}

/**
 * Submit: freezes the inspection, updates the vehicle mileage and, for a return, computes the
 * settlement against the pickup inspection. Requires mileage/fuel and at least four photos.
 */
export async function submitInspection(inspectionId: string, actorId: string) {
  const inspection = await db.inspection.findUnique({
    where: { id: inspectionId },
    include: {
      photos: true,
      damages: true,
      booking: { include: { priceSnapshots: { orderBy: { sequence: "desc" }, take: 1 } } },
    },
  });
  if (!inspection) throw new InspectionError("NOT_FOUND");
  if (inspection.status !== "DRAFT") throw new InspectionError("INVALID_STATUS");
  if (inspection.mileageKm === null || inspection.fuelLevelPercent === null)
    throw new InspectionError("DETAILS_REQUIRED");
  if (inspection.photos.length < REQUIRED_PHOTOS) throw new InspectionError("PHOTOS_REQUIRED");

  let settlement: Settlement | null = null;
  if (inspection.type === "RETURN" && inspection.booking) {
    const pickup = await db.inspection.findFirst({
      where: {
        bookingId: inspection.bookingId,
        type: "PICKUP",
        status: { in: ["SUBMITTED", "ACKNOWLEDGED"] },
      },
      orderBy: { submittedAt: "desc" },
    });
    if (!pickup) throw new InspectionError("PICKUP_MISSING");
    const settings = await getPricingSettings();
    const fuelRow = await db.systemSetting.findUnique({
      where: { key: "pricing.fuel_adjustment_xaf_per_percent" },
    });
    const snapshot = inspection.booking.priceSnapshots[0];
    settlement = computeSettlement({
      pickupMileageKm: pickup.mileageKm,
      returnMileageKm: inspection.mileageKm,
      pickupFuelPercent: pickup.fuelLevelPercent,
      returnFuelPercent: inspection.fuelLevelPercent,
      rentalDays: inspection.booking.rentalDays,
      kmAllowancePerDay: snapshot?.kmAllowance ?? null,
      extraKmRateXaf: snapshot?.extraKmRateXaf ?? null,
      newDamageEstimatesXaf: inspection.damages
        .filter((d) => !d.isPreExisting)
        .map((d) => d.estimateXaf ?? 0),
      scheduledEndAt: inspection.booking.endAt,
      returnedAt: inspection.performedAt,
      lateReturnFeeXafPerDay: settings.lateReturnFeeXafPerDay,
      fuelAdjustmentXafPerPercent: Number(fuelRow?.value ?? 0) || 0,
      depositXaf: snapshot?.securityDepositXaf ?? 0,
    });
  }

  const updated = await db.$transaction(async (tx) => {
    const u = await tx.inspection.update({
      where: { id: inspection.id },
      data: {
        status: "SUBMITTED",
        submittedAt: new Date(),
        staffAcknowledgedAt: new Date(),
        ...(settlement
          ? {
              extraKmXaf: settlement.extraKmXaf,
              fuelXaf: settlement.fuelXaf,
              damageXaf: settlement.damageXaf,
              lateXaf: settlement.lateXaf,
              deductionXaf: settlement.deductionXaf,
              settlement: settlement as unknown as Prisma.InputJsonValue,
            }
          : {}),
      },
    });
    await tx.vehicle.updateMany({
      where: { id: inspection.vehicleId, currentMileageKm: { lt: inspection.mileageKm! } },
      data: { currentMileageKm: inspection.mileageKm! },
    });
    if (inspection.type === "RETURN" && inspection.bookingId) {
      await tx.booking.update({
        where: { id: inspection.bookingId },
        data: { returnedAt: inspection.performedAt },
      });
    }
    return u;
  });
  await recordAudit({
    actorId,
    action: "inspection.submit",
    entityType: "Inspection",
    entityId: inspection.id,
    after: {
      type: inspection.type,
      mileageKm: inspection.mileageKm,
      deductionXaf: settlement?.deductionXaf ?? 0,
    },
  });
  return { inspection: updated, settlement };
}

/** Customer acknowledges or disputes a submitted inspection (evidence captured). */
export async function customerAcknowledgeInspection(input: {
  inspectionId: string;
  userId: string;
  decision: "ACKNOWLEDGE" | "DISPUTE";
  note?: string;
  evidence: { ipAddress?: string; userAgent?: string };
}) {
  const inspection = await db.inspection.findUnique({
    where: { id: input.inspectionId },
    include: { booking: { select: { id: true, customerId: true, status: true } } },
  });
  if (!inspection?.booking || inspection.booking.customerId !== input.userId)
    throw new InspectionError("NOT_FOUND");
  if (inspection.status !== "SUBMITTED") throw new InspectionError("INVALID_STATUS");
  const updated = await db.inspection.update({
    where: { id: inspection.id },
    data:
      input.decision === "ACKNOWLEDGE"
        ? { status: "ACKNOWLEDGED", customerAcknowledgedAt: new Date() }
        : { status: "DISPUTED", disputeNote: input.note ?? null },
  });
  await recordAudit({
    actorId: input.userId,
    action: input.decision === "ACKNOWLEDGE" ? "inspection.acknowledge" : "inspection.dispute",
    entityType: "Inspection",
    entityId: inspection.id,
    after: { ...input.evidence, note: input.note ?? null },
  });
  if (input.decision === "DISPUTE") {
    logger.warn("inspection.disputed", {
      inspectionId: inspection.id,
      bookingId: inspection.booking.id,
    });
  }
  return updated;
}

export async function getInspectionForStaff(id: string) {
  return db.inspection.findUnique({
    where: { id },
    include: {
      vehicle: {
        select: {
          id: true,
          make: true,
          model: true,
          registrationNumber: true,
          currentMileageKm: true,
        },
      },
      booking: {
        select: {
          id: true,
          reference: true,
          status: true,
          customerId: true,
          endAt: true,
          startAt: true,
        },
      },
      inspector: { select: { name: true } },
      photos: { orderBy: { createdAt: "asc" } },
      damages: { orderBy: { createdAt: "asc" } },
    },
  });
}

export async function getInspectionForCustomer(id: string, userId: string) {
  const inspection = await getInspectionForStaff(id);
  if (!inspection?.booking || inspection.booking.customerId !== userId)
    throw new InspectionError("NOT_FOUND");
  return inspection;
}

export async function listInspectionsForBooking(bookingId: string) {
  return db.inspection.findMany({
    where: { bookingId },
    orderBy: { createdAt: "asc" },
    include: {
      inspector: { select: { name: true } },
      _count: { select: { photos: true, damages: true } },
    },
  });
}

export async function listInspectionsForVehicle(vehicleId: string, take = 20) {
  return db.inspection.findMany({
    where: { vehicleId },
    orderBy: { createdAt: "desc" },
    take,
    include: {
      inspector: { select: { name: true } },
      booking: { select: { reference: true } },
      _count: { select: { photos: true, damages: true } },
    },
  });
}

/** Pickup done and return done flags for the booking workflow gates. */
export async function bookingInspectionState(bookingId: string) {
  const rows = await db.inspection.findMany({
    where: { bookingId, status: { in: ["SUBMITTED", "ACKNOWLEDGED"] } },
    select: { type: true, id: true, deductionXaf: true, status: true },
  });
  return {
    pickup: rows.find((r) => r.type === "PICKUP") ?? null,
    return: rows.find((r) => r.type === "RETURN") ?? null,
  };
}
