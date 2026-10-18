import { addDays } from "date-fns";

import { encryptField, hashForLookup } from "@/lib/crypto";
import { fromDoualaLocal } from "@/lib/dates";
import { recordAudit } from "@/server/audit";
import { db } from "@/server/db";
import { deleteStoredFile, storeFile } from "@/server/files/service";
import { sendTemplatedNotification } from "@/server/notifications";
import { alertStaff, alertUser } from "@/server/notifications/alerts";

import type { Prisma } from "@/generated/prisma/client";
import type { VehicleStatus } from "@/generated/prisma/enums";

import { evaluateVehicleCompliance } from "@/features/documents/lifecycle";
import { recomputeVehicleCompliance } from "@/features/documents/service";

import { EXTRA_PHOTO_START, PHOTO_VIEWS, type PhotoView } from "./schemas";

import type {
  ArrangementInput,
  BasicsInput,
  EquipmentInput,
  LocationInput,
  PricingInput,
} from "./schemas";

export class VehicleError extends Error {
  constructor(
    public readonly code:
      | "NOT_FOUND"
      | "FORBIDDEN"
      | "INVALID_STATUS"
      | "DUPLICATE_REGISTRATION"
      | "DUPLICATE_VIN"
      | "INCOMPLETE"
      | "NOT_EDITABLE",
    public readonly details?: string[],
  ) {
    super(code);
    this.name = "VehicleError";
  }
}

const EDITABLE_STATUSES: VehicleStatus[] = ["DRAFT", "REJECTED"];
export const OWNER_VISIBLE_STATUSES: VehicleStatus[] = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "APPROVED",
  "ACTIVE",
  "SUSPENDED",
  "UNAVAILABLE_DOCUMENTS",
  "WITHDRAWN",
  "REJECTED",
];

export const VEHICLE_TRANSITIONS: Record<VehicleStatus, VehicleStatus[]> = {
  DRAFT: ["SUBMITTED"],
  SUBMITTED: ["UNDER_REVIEW", "APPROVED", "REJECTED"],
  UNDER_REVIEW: ["APPROVED", "REJECTED"],
  APPROVED: ["ACTIVE", "SUSPENDED", "WITHDRAWN"],
  ACTIVE: ["SUSPENDED", "UNAVAILABLE_DOCUMENTS", "WITHDRAWN"],
  SUSPENDED: ["ACTIVE", "WITHDRAWN"],
  UNAVAILABLE_DOCUMENTS: ["ACTIVE", "SUSPENDED", "WITHDRAWN"],
  WITHDRAWN: [],
  REJECTED: ["SUBMITTED"],
};

export function canTransitionVehicle(from: VehicleStatus, to: VehicleStatus): boolean {
  return VEHICLE_TRANSITIONS[from].includes(to);
}

async function ownerProfileFor(userId: string) {
  const profile = await db.ownerProfile.findUnique({ where: { userId } });
  if (!profile) throw new VehicleError("FORBIDDEN");
  return profile;
}

/** Load a vehicle and assert the actor owns it (object-level access control). */
export async function getOwnedVehicle(vehicleId: string, userId: string) {
  const profile = await ownerProfileFor(userId);
  const vehicle = await db.vehicle.findFirst({
    where: { id: vehicleId, ownerProfileId: profile.id, deletedAt: null },
    include: {
      managementConfig: true,
      images: { orderBy: { sortOrder: "asc" } },
      documents: {
        where: { status: { not: "REPLACED" } },
        include: { documentType: true },
        orderBy: { createdAt: "desc" },
      },
      availabilityBlocks: { orderBy: { startAt: "asc" } },
      city: true,
      branch: true,
    },
  });
  if (!vehicle) throw new VehicleError("NOT_FOUND");
  return { vehicle, profile };
}

function assertEditable(status: VehicleStatus) {
  if (!EDITABLE_STATUSES.includes(status)) throw new VehicleError("NOT_EDITABLE");
}

export async function createVehicleDraft(userId: string, input: BasicsInput) {
  const profile = await ownerProfileFor(userId);
  const existing = await db.vehicle.findUnique({
    where: { registrationNumber: input.registrationNumber },
  });
  if (existing) throw new VehicleError("DUPLICATE_REGISTRATION");
  await assertVinAvailable(input.vin);
  const vehicle = await db.vehicle.create({
    data: {
      ...basicsToData(input),
      ownerProfileId: profile.id,
      ownershipModel: "FULLY_MANAGED_OWNER_VEHICLE",
      status: "DRAFT",
      dailyPriceXaf: 0,
      securityDepositXaf: 0,
      onboardingStep: "equipment",
    },
  });
  await recordAudit({
    actorId: userId,
    action: "vehicle.draft.create",
    entityType: "Vehicle",
    entityId: vehicle.id,
    after: { registrationNumber: input.registrationNumber },
  });
  return vehicle;
}

/** The VIN is unique (vinHash): refuse it with a clear error instead of a database crash. */
async function assertVinAvailable(vin: string | undefined | null, ownVehicleId?: string) {
  if (!vin) return;
  const taken = await db.vehicle.findUnique({
    where: { vinHash: hashForLookup(vin) },
    select: { id: true },
  });
  if (taken && taken.id !== ownVehicleId) throw new VehicleError("DUPLICATE_VIN");
}

function basicsToData(input: BasicsInput) {
  return {
    registrationNumber: input.registrationNumber,
    vinEnc: input.vin ? encryptField(input.vin.toUpperCase()) : null,
    vinHash: input.vin ? hashForLookup(input.vin) : null,
    make: input.make,
    model: input.model,
    trim: input.trim ?? null,
    manufacturingYear: input.manufacturingYear,
    firstRegistrationDate: input.firstRegistrationDate
      ? new Date(`${input.firstRegistrationDate}T00:00:00.000Z`)
      : null,
    category: input.category,
    bodyType: input.bodyType,
    colour: input.colour ?? null,
    transmission: input.transmission,
    fuelType: input.fuelType,
    engineCapacityCc: input.engineCapacityCc ?? null,
    seats: input.seats,
    doors: input.doors ?? null,
    currentMileageKm: input.currentMileageKm,
    cityId: input.cityId,
  };
}

export async function updateVehicleBasics(vehicleId: string, userId: string, input: BasicsInput) {
  const { vehicle } = await getOwnedVehicle(vehicleId, userId);
  assertEditable(vehicle.status);
  if (input.registrationNumber !== vehicle.registrationNumber) {
    const dup = await db.vehicle.findUnique({
      where: { registrationNumber: input.registrationNumber },
    });
    if (dup) throw new VehicleError("DUPLICATE_REGISTRATION");
  }
  await assertVinAvailable(input.vin, vehicle.id);
  return db.vehicle.update({
    where: { id: vehicleId },
    data: {
      ...basicsToData(input),
      onboardingStep: nextStep(vehicle.onboardingStep, "equipment"),
      version: { increment: 1 },
    },
  });
}

function nextStep(current: string, candidate: string) {
  const order = [
    "basics",
    "equipment",
    "location",
    "pricing",
    "photos",
    "documents",
    "arrangement",
    "review",
  ];
  return order.indexOf(candidate) > order.indexOf(current) ? candidate : current;
}

export async function updateVehicleEquipment(
  vehicleId: string,
  userId: string,
  input: EquipmentInput,
) {
  const { vehicle } = await getOwnedVehicle(vehicleId, userId);
  assertEditable(vehicle.status);
  return db.vehicle.update({
    where: { id: vehicleId },
    data: {
      hasAirConditioning: input.hasAirConditioning,
      hasBluetooth: input.hasBluetooth,
      hasUsbCharging: input.hasUsbCharging,
      hasReversingCamera: input.hasReversingCamera,
      safetyEquipment: input.safetyEquipment,
      descriptionFr: input.descriptionFr ?? null,
      descriptionEn: input.descriptionEn ?? null,
      existingDamageNotes: input.existingDamageNotes ?? null,
      onboardingStep: nextStep(vehicle.onboardingStep, "location"),
    },
  });
}

export async function updateVehicleLocation(
  vehicleId: string,
  userId: string,
  input: LocationInput,
) {
  const { vehicle } = await getOwnedVehicle(vehicleId, userId);
  assertEditable(vehicle.status);
  if (input.branchId) {
    const branch = await db.branch.findFirst({
      where: { id: input.branchId, cityId: vehicle.cityId, isActive: true },
    });
    if (!branch) throw new VehicleError("INCOMPLETE", ["branchId"]);
  }
  return db.vehicle.update({
    where: { id: vehicleId },
    data: {
      branchId: input.branchId ?? null,
      locationLabel: input.locationLabel ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      deliveryAvailable: input.deliveryAvailable,
      deliveryRadiusKm: input.deliveryAvailable ? (input.deliveryRadiusKm ?? null) : null,
      onboardingStep: nextStep(vehicle.onboardingStep, "pricing"),
    },
  });
}

export async function updateVehiclePricing(vehicleId: string, userId: string, input: PricingInput) {
  const { vehicle } = await getOwnedVehicle(vehicleId, userId);
  assertEditable(vehicle.status);
  return db.vehicle.update({
    where: { id: vehicleId },
    data: {
      dailyPriceXaf: input.dailyPriceXaf,
      weeklyPriceXaf: input.weeklyPriceXaf ?? null,
      monthlyPriceXaf: input.monthlyPriceXaf ?? null,
      securityDepositXaf: input.securityDepositXaf,
      dailyKmAllowance: input.dailyKmAllowance ?? null,
      extraKmRateXaf: input.extraKmRateXaf ?? null,
      selfDriveAllowed: input.selfDriveAllowed,
      chauffeurAvailable: input.chauffeurAvailable,
      chauffeurDailyFeeXaf: input.chauffeurAvailable ? (input.chauffeurDailyFeeXaf ?? null) : null,
      instantBooking: input.instantBooking,
      minRentalDays: input.minRentalDays,
      maxRentalDays: input.maxRentalDays ?? null,
      onboardingStep: nextStep(vehicle.onboardingStep, "photos"),
    },
  });
}

export async function updateVehicleArrangement(
  vehicleId: string,
  userId: string,
  input: ArrangementInput,
) {
  const { vehicle } = await getOwnedVehicle(vehicleId, userId);
  assertEditable(vehicle.status);
  const selfManaged = input.ownershipModel === "SELF_MANAGED_MARKETPLACE_VEHICLE";
  const config = {
    ownerApprovesBookings: selfManaged && input.ownerApprovesBookings,
    ownerHandlesHandover: selfManaged && input.ownerHandlesHandover,
    ownerHandlesInspections: selfManaged && input.ownerHandlesInspections,
    ownerHandlesCustomerContact: selfManaged && input.ownerHandlesCustomerContact,
    ownerHandlesMaintenance: selfManaged && input.ownerHandlesMaintenance,
    ownerApprovesExpensesAboveXaf: input.ownerApprovesExpensesAboveXaf ?? null,
  };
  return db.vehicle.update({
    where: { id: vehicleId },
    data: {
      ownershipModel: input.ownershipModel,
      onboardingStep: nextStep(vehicle.onboardingStep, "review"),
      managementConfig: { upsert: { create: config, update: config } },
    },
  });
}

const MAX_IMAGES = 12;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** The main photo is the first by position: the front view once it is uploaded. */
async function syncPrimaryImage(vehicleId: string) {
  const first = await db.vehicleImage.findFirst({
    where: { vehicleId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  if (!first) return;
  await db.vehicleImage.updateMany({
    where: { vehicleId, isPrimary: true, id: { not: first.id } },
    data: { isPrimary: false },
  });
  if (!first.isPrimary)
    await db.vehicleImage.update({ where: { id: first.id }, data: { isPrimary: true } });
}

function hasAllViews(images: { sortOrder: number }[]) {
  return PHOTO_VIEWS.every((_, slot) => images.some((i) => i.sortOrder === slot));
}

/**
 * Add a photo. With a `view` it fills (or replaces) that view's slot; without one it is an
 * optional extra photo placed after the four views.
 */
export async function addVehicleImage(
  vehicleId: string,
  userId: string,
  file: File,
  view?: PhotoView,
) {
  const { vehicle } = await getOwnedVehicle(vehicleId, userId);
  const slot = view ? PHOTO_VIEWS.indexOf(view) : -1;
  const replaced = slot >= 0 ? vehicle.images.find((i) => i.sortOrder === slot) : undefined;
  if (!replaced && vehicle.images.length >= MAX_IMAGES)
    throw new VehicleError("INCOMPLETE", ["maxImages"]);
  const stored = await storeFile({
    scope: "vehicle-images",
    entityId: vehicleId,
    file,
    allowedMimeTypes: IMAGE_TYPES,
    maxSizeBytes: 5 * 1024 * 1024,
    actorId: userId,
    access: "private",
  });
  const lastSort = Math.max(EXTRA_PHOTO_START - 1, ...vehicle.images.map((i) => i.sortOrder));
  const image = await db.vehicleImage.create({
    data: {
      vehicleId,
      storageKey: stored.storageKey,
      checksumSha256: stored.checksumSha256,
      sortOrder: slot >= 0 ? slot : lastSort + 1,
      isPrimary: false,
      isPublic: false,
    },
  });
  if (replaced) {
    await db.vehicleImage.delete({ where: { id: replaced.id } });
    await deleteStoredFile(replaced.storageKey, userId);
  }
  await syncPrimaryImage(vehicleId);
  const images = [...vehicle.images.filter((i) => i.id !== replaced?.id), image];
  if (vehicle.onboardingStep === "photos" && hasAllViews(images))
    await db.vehicle.update({ where: { id: vehicleId }, data: { onboardingStep: "documents" } });
  return image;
}

export async function removeVehicleImage(vehicleId: string, userId: string, imageId: string) {
  const { vehicle } = await getOwnedVehicle(vehicleId, userId);
  const image = vehicle.images.find((i) => i.id === imageId);
  if (!image) throw new VehicleError("NOT_FOUND");
  await db.vehicleImage.delete({ where: { id: imageId } });
  await deleteStoredFile(image.storageKey, userId);
  if (image.isPrimary) await syncPrimaryImage(vehicleId);
}

/** Validate completeness and move the draft to SUBMITTED; notifies the owner. */
export async function submitVehicle(vehicleId: string, userId: string) {
  const { vehicle, profile } = await getOwnedVehicle(vehicleId, userId);
  if (!canTransitionVehicle(vehicle.status, "SUBMITTED")) throw new VehicleError("INVALID_STATUS");
  const missing: string[] = [];
  if (vehicle.dailyPriceXaf <= 0) missing.push("pricing");
  if (!hasAllViews(vehicle.images)) missing.push("photos");
  if (!vehicle.managementConfig) missing.push("arrangement");
  const mandatoryTypes = await db.documentType.findMany({
    where: {
      subjectType: "VEHICLE",
      isMandatory: true,
      isActive: true,
      key: { not: "vehicle_management_agreement" },
    },
  });
  for (const type of mandatoryTypes) {
    if (
      !vehicle.documents.some(
        (d) =>
          d.documentTypeId === type.id &&
          ["SUBMITTED", "UNDER_REVIEW", "VERIFIED"].includes(d.status),
      )
    )
      missing.push(`document:${type.key}`);
  }
  if (!profile.agreementAcceptedAt) missing.push("ownerAgreement");
  if (missing.length) throw new VehicleError("INCOMPLETE", missing);

  const updated = await db.vehicle.update({
    where: { id: vehicleId },
    data: {
      status: "SUBMITTED",
      submittedAt: new Date(),
      rejectionReason: null,
      onboardingStep: "review",
    },
  });
  await recordAudit({
    actorId: userId,
    action: "vehicle.submit",
    entityType: "Vehicle",
    entityId: vehicleId,
    before: { status: vehicle.status },
    after: { status: "SUBMITTED" },
  });
  const owner = await db.user.findUnique({ where: { id: userId } });
  if (owner) {
    await sendTemplatedNotification({
      templateKey: "vehicle_submitted",
      channel: "EMAIL",
      locale: owner.preferredLocale === "en" ? "en" : "fr",
      to: owner.email,
      userId: owner.id,
      variables: {
        ownerName: owner.name,
        vehicle: `${vehicle.make} ${vehicle.model} (${vehicle.registrationNumber})`,
      },
      entityType: "Vehicle",
      entityId: vehicleId,
    });
  }
  await alertStaff("vehicle.review", {
    templateKey: "staff_vehicle_review",
    variables: {
      vehicle: `${vehicle.make} ${vehicle.model} (${vehicle.registrationNumber})`,
      owner: owner?.name ?? "",
    },
    entityType: "Vehicle",
    entityId: vehicleId,
    dedupeKey: `vehicle_submitted:${vehicleId}:${updated.submittedAt?.getTime()}`,
    exceptUserId: userId,
  });
  return updated;
}

/** Administrator review: approve (requires verified mandatory documents), reject, suspend, reinstate, withdraw. */
export async function reviewVehicle(input: {
  vehicleId: string;
  decision: "UNDER_REVIEW" | "APPROVED" | "REJECTED" | "SUSPENDED" | "ACTIVE" | "WITHDRAWN";
  reason?: string;
  actorId: string;
}) {
  const vehicle = await db.vehicle.findUnique({
    where: { id: input.vehicleId },
    include: {
      documents: {
        where: { status: { in: ["VERIFIED", "EXPIRED"] } },
        include: { documentType: true },
      },
      ownerProfile: { include: { user: true } },
      documentOverrides: { where: { revokedAt: null, expiresAt: { gt: new Date() } }, take: 1 },
    },
  });
  if (!vehicle) throw new VehicleError("NOT_FOUND");
  if (!canTransitionVehicle(vehicle.status, input.decision))
    throw new VehicleError("INVALID_STATUS");

  const data: Prisma.VehicleUpdateInput = {
    status: input.decision,
    reviewer: { connect: { id: input.actorId } },
    reviewedAt: new Date(),
  };
  if (input.decision === "APPROVED") {
    const mandatoryTypes = await db.documentType.findMany({
      where: {
        subjectType: "VEHICLE",
        isMandatory: true,
        isActive: true,
        key: { not: "vehicle_management_agreement" },
      },
      select: { key: true, blocksVehicleWhenExpired: true },
    });
    const compliance = evaluateVehicleCompliance(
      mandatoryTypes,
      vehicle.documents,
      new Date(),
      vehicle.documentOverrides[0],
    );
    if (!compliance.valid)
      throw new VehicleError("INCOMPLETE", [
        ...compliance.missing.map((k) => `document:${k}`),
        ...compliance.expired.map((k) => `expired:${k}`),
      ]);
    data.status = "ACTIVE";
    data.publishedAt = vehicle.publishedAt ?? new Date();
    data.documentsValid = true;
    data.rejectionReason = null;
  }
  if (input.decision === "REJECTED") data.rejectionReason = input.reason ?? null;
  if (input.decision === "SUSPENDED") data.suspensionReason = input.reason ?? null;
  if (input.decision === "ACTIVE") data.suspensionReason = null;
  if (input.decision === "WITHDRAWN") {
    data.ownerRequestType = null;
    data.ownerRequestReason = null;
    data.ownerRequestedAt = null;
  }

  const updated = await db.vehicle.update({ where: { id: input.vehicleId }, data });
  await recordAudit({
    actorId: input.actorId,
    action: `vehicle.${input.decision.toLowerCase()}`,
    entityType: "Vehicle",
    entityId: input.vehicleId,
    before: { status: vehicle.status },
    after: { status: updated.status },
    reason: input.reason,
  });

  const owner = vehicle.ownerProfile?.user;
  if (owner && input.decision === "APPROVED") {
    await sendTemplatedNotification({
      templateKey: "vehicle_approved",
      channel: "EMAIL",
      locale: owner.preferredLocale === "en" ? "en" : "fr",
      to: owner.email,
      userId: owner.id,
      variables: {
        ownerName: owner.name,
        vehicle: `${vehicle.make} ${vehicle.model} (${vehicle.registrationNumber})`,
      },
      entityType: "Vehicle",
      entityId: vehicle.id,
    });
  }
  if (owner && input.decision === "REJECTED") {
    await alertUser(owner, {
      templateKey: "vehicle_changes_requested",
      variables: {
        ownerName: owner.name,
        vehicle: `${vehicle.make} ${vehicle.model} (${vehicle.registrationNumber})`,
        comment: input.reason ?? "",
      },
      entityType: "Vehicle",
      entityId: vehicle.id,
      dedupeKey: `vehicle_rejected:${vehicle.id}:${updated.reviewedAt?.getTime()}`,
    });
  }
  if (input.decision === "ACTIVE") await recomputeVehicleCompliance(vehicle.id, "reinstated");
  return updated;
}

export async function requestVehicleChange(
  vehicleId: string,
  userId: string,
  type: "SUSPENSION" | "WITHDRAWAL",
  reason: string,
) {
  const { vehicle } = await getOwnedVehicle(vehicleId, userId);
  if (!["ACTIVE", "APPROVED", "SUSPENDED", "UNAVAILABLE_DOCUMENTS"].includes(vehicle.status))
    throw new VehicleError("INVALID_STATUS");
  const updated = await db.vehicle.update({
    where: { id: vehicleId },
    data: { ownerRequestType: type, ownerRequestReason: reason, ownerRequestedAt: new Date() },
  });
  await recordAudit({
    actorId: userId,
    action: `vehicle.owner_request.${type.toLowerCase()}`,
    entityType: "Vehicle",
    entityId: vehicleId,
    reason,
  });
  const labels = {
    SUSPENSION: { fr: "suspension temporaire", en: "temporary suspension" },
    WITHDRAWAL: { fr: "retrait de la flotte", en: "withdrawal from the fleet" },
  };
  await alertStaff(type === "SUSPENSION" ? "vehicle.suspend" : "vehicle.withdraw", {
    templateKey: "staff_vehicle_change_request",
    variables: (locale) => ({
      vehicle: `${vehicle.make} ${vehicle.model} (${vehicle.registrationNumber})`,
      request: `${labels[type][locale]} — ${reason}`,
    }),
    entityType: "Vehicle",
    entityId: vehicleId,
    dedupeKey: `vehicle_owner_request:${vehicleId}:${updated.ownerRequestedAt?.getTime()}`,
    exceptUserId: userId,
  });
  return updated;
}

export async function addAvailabilityBlock(
  vehicleId: string,
  userId: string,
  input: { startDate: string; endDate: string; reason?: string },
) {
  await getOwnedVehicle(vehicleId, userId);
  const startAt = fromDoualaLocal(`${input.startDate}T00:00`);
  const endAt = addDays(fromDoualaLocal(`${input.endDate}T00:00`), 1);
  const conflicting = await db.booking.count({
    where: {
      vehicleId,
      status: { in: ["CONFIRMED", "READY_FOR_PICKUP", "ACTIVE", "EXTENSION_REQUESTED"] },
      startAt: { lt: endAt },
      endAt: { gt: startAt },
    },
  });
  if (conflicting > 0) throw new VehicleError("INVALID_STATUS", ["bookingConflict"]);
  const block = await db.vehicleAvailability.create({
    data: {
      vehicleId,
      type: "OWNER_BLOCK",
      startAt,
      endAt,
      reason: input.reason ?? null,
      createdBy: userId,
    },
  });
  await recordAudit({
    actorId: userId,
    action: "vehicle.availability.block",
    entityType: "VehicleAvailability",
    entityId: block.id,
    after: { vehicleId, startAt, endAt },
  });
  return block;
}

export async function removeAvailabilityBlock(vehicleId: string, userId: string, blockId: string) {
  await getOwnedVehicle(vehicleId, userId);
  const block = await db.vehicleAvailability.findFirst({
    where: { id: blockId, vehicleId, type: "OWNER_BLOCK" },
  });
  if (!block) throw new VehicleError("NOT_FOUND");
  await db.vehicleAvailability.delete({ where: { id: blockId } });
  await recordAudit({
    actorId: userId,
    action: "vehicle.availability.unblock",
    entityType: "VehicleAvailability",
    entityId: blockId,
  });
}

export async function listOwnerVehicles(userId: string) {
  const profile = await db.ownerProfile.findUnique({ where: { userId } });
  if (!profile) return [];
  return db.vehicle.findMany({
    where: { ownerProfileId: profile.id, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: {
      city: true,
      images: { where: { isPrimary: true }, take: 1 },
      documents: {
        where: { status: { not: "REPLACED" } },
        select: { status: true, expiryDate: true },
      },
    },
  });
}
