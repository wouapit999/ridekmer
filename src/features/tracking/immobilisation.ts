import { isStationary, type ImmobilisationProvider } from "@ridekmer/tracking";

import { recordAudit } from "@/server/audit";
import { db } from "@/server/db";

import type { ImmobilisationStatus } from "@/generated/prisma/enums";

import { TrackingError } from "./devices";
import { latestFixForVehicle } from "./queries";

/**
 * No immobilisation provider exists in this code base (ADR-010). This hook is where a
 * future, contractually approved provider would be registered; until then every executed
 * request ends in UNAVAILABLE and nothing is ever sent to a vehicle.
 */
export function getImmobilisationProvider(): ImmobilisationProvider | null {
  return null;
}

export async function requestImmobilisation(input: {
  vehicleId: string;
  bookingId?: string | null;
  reason: string;
  actorId: string;
}) {
  if (input.reason.trim().length < 10) throw new TrackingError("REASON_REQUIRED");
  const open = await db.immobilisationRequest.findFirst({
    where: {
      vehicleId: input.vehicleId,
      status: { in: ["REQUESTED", "STATIONARY_CONFIRMED", "APPROVED", "SENT_TO_PROVIDER"] },
    },
  });
  if (open) throw new TrackingError("INVALID_STATUS", "an open request already exists");
  const request = await db.immobilisationRequest.create({
    data: {
      vehicleId: input.vehicleId,
      bookingId: input.bookingId ?? null,
      reason: input.reason.trim(),
      requestedById: input.actorId,
    },
  });
  await recordAudit({
    actorId: input.actorId,
    action: "immobilisation.request",
    entityType: "ImmobilisationRequest",
    entityId: request.id,
    after: { vehicleId: input.vehicleId },
    reason: input.reason,
  });
  return request;
}

/** Step 1: the vehicle must be verifiably stationary (recent fix, no speed, ignition off). */
export async function confirmStationary(input: { requestId: string; actorId: string }) {
  const request = await db.immobilisationRequest.findUnique({ where: { id: input.requestId } });
  if (!request) throw new TrackingError("NOT_FOUND");
  if (request.status !== "REQUESTED") throw new TrackingError("INVALID_STATUS");
  const fix = await latestFixForVehicle(request.vehicleId);
  if (
    !isStationary(
      fix
        ? { recordedAt: fix.recordedAt, speedKmh: fix.speedKmh, ignitionOn: fix.ignitionOn }
        : null,
    )
  ) {
    await recordAudit({
      actorId: input.actorId,
      action: "immobilisation.stationary_check_failed",
      entityType: "ImmobilisationRequest",
      entityId: request.id,
      after: { lastSpeedKmh: fix?.speedKmh ?? null, lastLocationAt: fix?.recordedAt ?? null },
    });
    throw new TrackingError("NOT_STATIONARY");
  }
  const updated = await db.immobilisationRequest.update({
    where: { id: request.id },
    data: {
      status: "STATIONARY_CONFIRMED",
      stationaryConfirmedAt: new Date(),
      stationaryConfirmedBy: input.actorId,
      lastSpeedKmh: fix!.speedKmh ?? 0,
      lastLocationAt: fix!.recordedAt,
    },
  });
  await recordAudit({
    actorId: input.actorId,
    action: "immobilisation.stationary_confirmed",
    entityType: "ImmobilisationRequest",
    entityId: request.id,
    after: { lastLocationAt: fix!.recordedAt },
  });
  return updated;
}

/** Step 2: two distinct approvers, neither of them the requester. */
export async function decideImmobilisation(input: {
  requestId: string;
  approverId: string;
  decision: "APPROVED" | "REJECTED";
  comment?: string | null;
}) {
  const request = await db.immobilisationRequest.findUnique({ where: { id: input.requestId } });
  if (!request) throw new TrackingError("NOT_FOUND");
  if (request.status !== "STATIONARY_CONFIRMED") throw new TrackingError("INVALID_STATUS");
  if (request.requestedById === input.approverId) throw new TrackingError("SELF_APPROVAL");
  const existing = await db.approval.findUnique({
    where: {
      subjectType_subjectId_approverId: {
        subjectType: "IMMOBILISATION_REQUEST",
        subjectId: request.id,
        approverId: input.approverId,
      },
    },
  });
  if (existing) throw new TrackingError("ALREADY_DECIDED");
  await db.approval.create({
    data: {
      subjectType: "IMMOBILISATION_REQUEST",
      subjectId: request.id,
      approverId: input.approverId,
      decision: input.decision,
      comment: input.comment ?? null,
    },
  });
  await recordAudit({
    actorId: input.approverId,
    action: input.decision === "APPROVED" ? "immobilisation.approve" : "immobilisation.reject",
    entityType: "ImmobilisationRequest",
    entityId: request.id,
    reason: input.comment ?? null,
  });
  if (input.decision === "REJECTED") {
    return db.immobilisationRequest.update({
      where: { id: request.id },
      data: {
        status: "REJECTED",
        closedAt: new Date(),
        providerMessage: input.comment ?? "rejected",
      },
    });
  }
  const approvals = await db.approval.count({
    where: { subjectType: "IMMOBILISATION_REQUEST", subjectId: request.id, decision: "APPROVED" },
  });
  if (approvals < 2) return request;
  return db.immobilisationRequest.update({
    where: { id: request.id },
    data: { status: "APPROVED" },
  });
}

/**
 * Step 3: send to the provider. The stationary check is repeated at execution time. With no
 * provider registered the request is closed as UNAVAILABLE and the audit log says so.
 */
export async function executeImmobilisation(input: { requestId: string; actorId: string }) {
  const request = await db.immobilisationRequest.findUnique({
    where: { id: input.requestId },
    include: {
      vehicle: {
        include: {
          trackerAssignments: { where: { unassignedAt: null }, include: { device: true } },
        },
      },
    },
  });
  if (!request) throw new TrackingError("NOT_FOUND");
  if (request.status !== "APPROVED") throw new TrackingError("INVALID_STATUS");
  const fix = await latestFixForVehicle(request.vehicleId);
  if (
    !isStationary(
      fix
        ? { recordedAt: fix.recordedAt, speedKmh: fix.speedKmh, ignitionOn: fix.ignitionOn }
        : null,
    )
  )
    throw new TrackingError("NOT_STATIONARY");
  const approvals = await db.approval.findMany({
    where: { subjectType: "IMMOBILISATION_REQUEST", subjectId: request.id, decision: "APPROVED" },
    select: { id: true },
  });
  if (approvals.length < 2) throw new TrackingError("INVALID_STATUS");
  const provider = getImmobilisationProvider();
  const device = request.vehicle.trackerAssignments[0]?.device;
  if (!provider || !device) {
    const closed = await db.immobilisationRequest.update({
      where: { id: request.id },
      data: {
        status: "UNAVAILABLE",
        executedAt: new Date(),
        executedById: input.actorId,
        closedAt: new Date(),
        providerMessage: !device
          ? "No tracker assigned to this vehicle"
          : "No immobilisation provider is configured (interface only); nothing was sent",
      },
    });
    await recordAudit({
      actorId: input.actorId,
      action: "immobilisation.unavailable",
      entityType: "ImmobilisationRequest",
      entityId: request.id,
      after: { providerMessage: closed.providerMessage },
    });
    return closed;
  }
  await db.immobilisationRequest.update({
    where: { id: request.id },
    data: {
      status: "SENT_TO_PROVIDER",
      executedAt: new Date(),
      executedById: input.actorId,
      providerId: provider.id,
    },
  });
  const result = await provider.requestImmobilisation({
    externalDeviceId: device.externalDeviceId,
    approvalIds: [approvals[0]!.id, approvals[1]!.id],
    reason: request.reason,
    requestedBy: request.requestedById,
    stationaryConfirmedAt: request.stationaryConfirmedAt ?? new Date(),
  });
  const final = await db.immobilisationRequest.update({
    where: { id: request.id },
    data: {
      status: result.accepted ? "ACKNOWLEDGED" : "UNAVAILABLE",
      providerReference: result.providerReference ?? null,
      providerMessage: result.message ?? null,
      closedAt: new Date(),
    },
  });
  await recordAudit({
    actorId: input.actorId,
    action: "immobilisation.provider_result",
    entityType: "ImmobilisationRequest",
    entityId: request.id,
    after: { accepted: result.accepted, providerReference: result.providerReference ?? null },
  });
  return final;
}

export async function cancelImmobilisation(input: {
  requestId: string;
  actorId: string;
  reason?: string | null;
}) {
  const request = await db.immobilisationRequest.findUnique({ where: { id: input.requestId } });
  if (!request) throw new TrackingError("NOT_FOUND");
  if (["ACKNOWLEDGED", "REJECTED", "CANCELLED", "UNAVAILABLE"].includes(request.status))
    throw new TrackingError("INVALID_STATUS");
  const updated = await db.immobilisationRequest.update({
    where: { id: request.id },
    data: {
      status: "CANCELLED",
      closedAt: new Date(),
      providerMessage: input.reason ?? "cancelled",
    },
  });
  await recordAudit({
    actorId: input.actorId,
    action: "immobilisation.cancel",
    entityType: "ImmobilisationRequest",
    entityId: request.id,
    reason: input.reason ?? null,
  });
  return updated;
}

export async function listImmobilisationRequests(
  filter: { status?: ImmobilisationStatus | "ALL"; page: number },
  pageSize = 25,
) {
  const where = filter.status && filter.status !== "ALL" ? { status: filter.status } : {};
  const [total, requests] = await Promise.all([
    db.immobilisationRequest.count({ where }),
    db.immobilisationRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (filter.page - 1) * pageSize,
      take: pageSize,
      include: {
        vehicle: { select: { id: true, make: true, model: true, registrationNumber: true } },
        requestedBy: { select: { id: true, name: true } },
      },
    }),
  ]);
  const approvals = await db.approval.findMany({
    where: { subjectType: "IMMOBILISATION_REQUEST", subjectId: { in: requests.map((r) => r.id) } },
    include: { approver: { select: { id: true, name: true } } },
  });
  return { total, requests, pages: Math.max(1, Math.ceil(total / pageSize)), approvals };
}
