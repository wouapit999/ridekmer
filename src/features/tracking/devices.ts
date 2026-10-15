import { encryptField } from "@/lib/crypto";
import { recordAudit } from "@/server/audit";
import { db } from "@/server/db";

import type { TrackerDeviceType } from "@/generated/prisma/enums";

export class TrackingError extends Error {
  constructor(
    public readonly code:
      | "NOT_FOUND"
      | "FORBIDDEN"
      | "INVALID_STATUS"
      | "CONSENT_REQUIRED"
      | "ALREADY_ASSIGNED"
      | "DUPLICATE_DEVICE"
      | "NOT_STATIONARY"
      | "SELF_APPROVAL"
      | "ALREADY_DECIDED"
      | "NO_PROVIDER"
      | "REASON_REQUIRED",
    message?: string,
  ) {
    super(message ?? code);
    this.name = "TrackingError";
  }
}

export async function registerDevice(input: {
  type: TrackerDeviceType;
  provider: string;
  externalDeviceId: string;
  model?: string | null;
  serialNumber?: string | null;
  simNumber?: string | null;
  actorId: string;
}) {
  const existing = await db.trackerDevice.findUnique({
    where: {
      provider_externalDeviceId: {
        provider: input.provider,
        externalDeviceId: input.externalDeviceId,
      },
    },
  });
  if (existing) throw new TrackingError("DUPLICATE_DEVICE");
  const device = await db.trackerDevice.create({
    data: {
      type: input.type,
      provider: input.provider,
      externalDeviceId: input.externalDeviceId,
      model: input.model ?? null,
      serialNumberEnc: input.serialNumber ? encryptField(input.serialNumber) : null,
      simNumberEnc: input.simNumber ? encryptField(input.simNumber) : null,
      registeredById: input.actorId,
    },
  });
  await recordAudit({
    actorId: input.actorId,
    action: "tracker.register",
    entityType: "TrackerDevice",
    entityId: device.id,
    after: { type: input.type, provider: input.provider },
  });
  return device;
}

/**
 * Assign a device to a vehicle. Owner vehicles require the owner's recorded consent (date +
 * optional consent document) — tracking is never installed without it. Consumer tags are
 * secondary recovery devices only and need the same consent.
 */
export async function assignDevice(input: {
  deviceId: string;
  vehicleId: string;
  ownerConsentAt?: Date | null;
  consentNotes?: string | null;
  consentDocumentKey?: string | null;
  installationNotes?: string | null;
  actorId: string;
}) {
  const [device, vehicle] = await Promise.all([
    db.trackerDevice.findUnique({
      where: { id: input.deviceId },
      include: { assignments: { where: { unassignedAt: null } } },
    }),
    db.vehicle.findUnique({
      where: { id: input.vehicleId },
      select: { id: true, ownershipModel: true, ownerProfileId: true },
    }),
  ]);
  if (!device || !vehicle) throw new TrackingError("NOT_FOUND");
  if (device.status === "REMOVED") throw new TrackingError("INVALID_STATUS");
  if (device.assignments.length > 0) throw new TrackingError("ALREADY_ASSIGNED");
  const needsConsent = vehicle.ownershipModel !== "RIDEKMER_OWNED";
  if (needsConsent && !input.ownerConsentAt) throw new TrackingError("CONSENT_REQUIRED");
  const assignment = await db.$transaction(async (tx) => {
    const a = await tx.vehicleTrackerAssignment.create({
      data: {
        vehicleId: vehicle.id,
        deviceId: device.id,
        ownerConsentAt: input.ownerConsentAt ?? null,
        consentNotes: input.consentNotes ?? null,
        assignedBy: input.actorId,
      },
    });
    await tx.trackerDevice.update({
      where: { id: device.id },
      data: {
        status: "INSTALLED",
        installedAt: new Date(),
        installedBy: input.actorId,
        installationNotes: input.installationNotes ?? device.installationNotes,
        consentDocumentKey: input.consentDocumentKey ?? device.consentDocumentKey,
      },
    });
    return a;
  });
  await recordAudit({
    actorId: input.actorId,
    action: "tracker.assign",
    entityType: "VehicleTrackerAssignment",
    entityId: assignment.id,
    after: {
      vehicleId: vehicle.id,
      deviceId: device.id,
      ownerConsentAt: input.ownerConsentAt ?? null,
    },
  });
  return assignment;
}

export async function unassignDevice(input: {
  deviceId: string;
  actorId: string;
  reason?: string | null;
  removed?: boolean;
}) {
  const active = await db.vehicleTrackerAssignment.findFirst({
    where: { deviceId: input.deviceId, unassignedAt: null },
  });
  if (!active) throw new TrackingError("NOT_FOUND");
  await db.$transaction([
    db.vehicleTrackerAssignment.update({
      where: { id: active.id },
      data: { unassignedAt: new Date() },
    }),
    db.trackerDevice.update({
      where: { id: input.deviceId },
      data: { status: input.removed ? "REMOVED" : "REGISTERED" },
    }),
  ]);
  await recordAudit({
    actorId: input.actorId,
    action: "tracker.unassign",
    entityType: "VehicleTrackerAssignment",
    entityId: active.id,
    reason: input.reason ?? null,
    after: { removed: input.removed ?? false },
  });
}

export async function listDevices() {
  return db.trackerDevice.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      assignments: {
        where: { unassignedAt: null },
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
        },
      },
      registeredBy: { select: { name: true } },
    },
  });
}

export async function activeAssignmentForVehicle(vehicleId: string) {
  return db.vehicleTrackerAssignment.findFirst({
    where: { vehicleId, unassignedAt: null },
    include: { device: true },
    orderBy: { assignedAt: "desc" },
  });
}
