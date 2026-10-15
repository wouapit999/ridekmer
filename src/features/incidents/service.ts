import { formatIsoDate } from "@/lib/dates";
import { humanReference } from "@/lib/ids";
import { recordAudit } from "@/server/audit";
import { db } from "@/server/db";
import { storeFile } from "@/server/files/service";
import { sendTemplatedNotification } from "@/server/notifications";

import type { IncidentStatus, IncidentType } from "@/generated/prisma/enums";

import { INCIDENT_TRANSITIONS } from "./state-machine";

export { INCIDENT_TRANSITIONS };

export class IncidentError extends Error {
  constructor(
    public readonly code: "NOT_FOUND" | "FORBIDDEN" | "INVALID_STATUS" | "BOOKING_STATUS",
    message?: string,
  ) {
    super(message ?? code);
    this.name = "IncidentError";
  }
}

const INCIDENT_PHOTO_MIME = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

export async function reportIncident(input: {
  vehicleId: string;
  bookingId?: string | null;
  type: IncidentType;
  occurredAt: Date;
  description: string;
  locationDescription?: string | null;
  policeReportNumber?: string | null;
  reporterId: string;
  /** True when the reporter is the booking's customer (object-level check applied). */
  asCustomer?: boolean;
  photos?: File[];
  blockVehicle?: boolean;
}) {
  if (input.bookingId) {
    const booking = await db.booking.findUnique({ where: { id: input.bookingId } });
    if (!booking || booking.vehicleId !== input.vehicleId) throw new IncidentError("NOT_FOUND");
    if (input.asCustomer) {
      if (booking.customerId !== input.reporterId) throw new IncidentError("FORBIDDEN");
      if (!["ACTIVE", "EXTENSION_REQUESTED", "COMPLETED", "DISPUTED"].includes(booking.status))
        throw new IncidentError("BOOKING_STATUS");
    }
  } else if (input.asCustomer) {
    throw new IncidentError("FORBIDDEN");
  }
  const incident = await db.$transaction(async (tx) => {
    const created = await tx.incident.create({
      data: {
        reference: humanReference("IN"),
        vehicleId: input.vehicleId,
        bookingId: input.bookingId ?? null,
        type: input.type,
        status: "REPORTED",
        reportedById: input.reporterId,
        occurredAt: input.occurredAt,
        description: input.description,
        locationDescription: input.locationDescription ?? null,
        policeReportNumber: input.policeReportNumber ?? null,
      },
    });
    await tx.incidentStatusHistory.create({
      data: {
        incidentId: created.id,
        fromStatus: null,
        toStatus: "REPORTED",
        actorId: input.reporterId,
      },
    });
    if (input.blockVehicle) {
      await tx.vehicleAvailability.create({
        data: {
          vehicleId: input.vehicleId,
          type: "INCIDENT",
          startAt: new Date(),
          endAt: new Date(Date.now() + 7 * 86_400_000),
          reason: `incident ${created.reference}`,
          createdBy: input.reporterId,
        },
      });
    }
    return created;
  });
  const keys: string[] = [];
  for (const file of input.photos ?? []) {
    if (!file || file.size === 0) continue;
    const stored = await storeFile({
      scope: "incidents",
      entityId: incident.id,
      file,
      allowedMimeTypes: INCIDENT_PHOTO_MIME,
      actorId: input.reporterId,
    });
    keys.push(stored.storageKey);
  }
  if (keys.length)
    await db.incident.update({ where: { id: incident.id }, data: { photoKeys: keys } });
  await recordAudit({
    actorId: input.reporterId,
    action: "incident.report",
    entityType: "Incident",
    entityId: incident.id,
    after: {
      type: input.type,
      vehicleId: input.vehicleId,
      bookingId: input.bookingId ?? null,
      photos: keys.length,
    },
  });
  await notifyIncident(incident.id);
  return incident;
}

export async function transitionIncident(input: {
  incidentId: string;
  to: IncidentStatus;
  actorId: string;
  note?: string | null;
}) {
  const incident = await db.incident.findUnique({ where: { id: input.incidentId } });
  if (!incident) throw new IncidentError("NOT_FOUND");
  if (!INCIDENT_TRANSITIONS[incident.status].includes(input.to))
    throw new IncidentError("INVALID_STATUS");
  const updated = await db.$transaction(async (tx) => {
    const u = await tx.incident.update({
      where: { id: incident.id },
      data: {
        status: input.to,
        resolvedAt: input.to === "RESOLVED" ? new Date() : incident.resolvedAt,
      },
    });
    await tx.incidentStatusHistory.create({
      data: {
        incidentId: incident.id,
        fromStatus: incident.status,
        toStatus: input.to,
        actorId: input.actorId,
        note: input.note ?? null,
      },
    });
    if (input.to === "CLOSED") {
      await tx.vehicleAvailability.updateMany({
        where: {
          vehicleId: incident.vehicleId,
          type: "INCIDENT",
          reason: `incident ${incident.reference}`,
          endAt: { gt: new Date() },
        },
        data: { endAt: new Date() },
      });
    }
    return u;
  });
  await recordAudit({
    actorId: input.actorId,
    action: `incident.${input.to.toLowerCase()}`,
    entityType: "Incident",
    entityId: incident.id,
    before: { status: incident.status },
    after: { status: input.to },
    reason: input.note ?? null,
  });
  await notifyIncident(incident.id);
  return updated;
}

/** Responsibility outcome (`incident.resolve`): estimates and the deduction proposed to finance. */
export async function recordIncidentResolution(input: {
  incidentId: string;
  actorId: string;
  repairEstimateXaf?: number | null;
  customerLiableXaf?: number | null;
  depositDeductionXaf?: number | null;
  responsibilityNotes?: string | null;
  resolutionNotes?: string | null;
}) {
  const incident = await db.incident.findUnique({ where: { id: input.incidentId } });
  if (!incident) throw new IncidentError("NOT_FOUND");
  if (incident.status === "CLOSED") throw new IncidentError("INVALID_STATUS");
  const updated = await db.incident.update({
    where: { id: incident.id },
    data: {
      repairEstimateXaf: input.repairEstimateXaf ?? null,
      customerLiableXaf: input.customerLiableXaf ?? null,
      depositDeductionXaf: input.depositDeductionXaf ?? null,
      responsibilityNotes: input.responsibilityNotes ?? null,
      resolutionNotes: input.resolutionNotes ?? null,
    },
  });
  await recordAudit({
    actorId: input.actorId,
    action: "incident.resolution",
    entityType: "Incident",
    entityId: incident.id,
    after: {
      repairEstimateXaf: input.repairEstimateXaf ?? null,
      customerLiableXaf: input.customerLiableXaf ?? null,
      depositDeductionXaf: input.depositDeductionXaf ?? null,
    },
  });
  return updated;
}

export async function upsertInsuranceClaim(input: {
  incidentId: string;
  actorId: string;
  claimId?: string | null;
  insurerName: string;
  claimReference?: string | null;
  status: "DRAFT" | "SUBMITTED" | "IN_PROGRESS" | "SETTLED" | "REJECTED" | "CLOSED";
  claimedXaf?: number | null;
  settledXaf?: number | null;
  notes?: string | null;
}) {
  const data = {
    insurerName: input.insurerName,
    claimReference: input.claimReference ?? null,
    status: input.status,
    claimedXaf: input.claimedXaf ?? null,
    settledXaf: input.settledXaf ?? null,
    notes: input.notes ?? null,
    submittedAt: input.status === "SUBMITTED" ? new Date() : undefined,
    settledAt: input.status === "SETTLED" ? new Date() : undefined,
  };
  const claim = input.claimId
    ? await db.insuranceClaim.update({ where: { id: input.claimId }, data })
    : await db.insuranceClaim.create({ data: { incidentId: input.incidentId, ...data } });
  await recordAudit({
    actorId: input.actorId,
    action: "incident.claim.save",
    entityType: "InsuranceClaim",
    entityId: claim.id,
    after: { status: input.status, claimedXaf: input.claimedXaf ?? null },
  });
  return claim;
}

async function notifyIncident(incidentId: string) {
  const incident = await db.incident.findUnique({
    where: { id: incidentId },
    include: {
      vehicle: { select: { make: true, model: true } },
      booking: {
        select: {
          reference: true,
          customer: { select: { id: true, name: true, email: true, preferredLocale: true } },
        },
      },
    },
  });
  if (!incident?.booking) return;
  const c = incident.booking.customer;
  const locale = c.preferredLocale === "en" ? "en" : "fr";
  await sendTemplatedNotification({
    templateKey: "incident_update",
    channel: "EMAIL",
    locale,
    to: c.email,
    userId: c.id,
    variables: {
      name: c.name,
      reference: incident.reference,
      vehicle: `${incident.vehicle.make} ${incident.vehicle.model}`,
      status: incident.status,
    },
    entityType: "Incident",
    entityId: incident.id,
    dedupeKey: `incident_${incident.status.toLowerCase()}:${incident.id}:${formatIsoDate(new Date())}`,
  });
}

export async function getIncidentForStaff(id: string) {
  return db.incident.findUnique({
    where: { id },
    include: {
      vehicle: { select: { id: true, make: true, model: true, registrationNumber: true } },
      booking: {
        select: {
          id: true,
          reference: true,
          customer: { select: { id: true, name: true, email: true } },
        },
      },
      reportedBy: { select: { name: true } },
      statusHistory: {
        orderBy: { createdAt: "asc" },
        include: { actor: { select: { name: true } } },
      },
      claims: { orderBy: { createdAt: "asc" } },
      damages: true,
    },
  });
}

export async function listIncidentsForAdmin(
  filter: { status?: IncidentStatus | "ALL"; page: number },
  pageSize = 25,
) {
  const where = filter.status && filter.status !== "ALL" ? { status: filter.status } : {};
  const [total, incidents] = await Promise.all([
    db.incident.count({ where }),
    db.incident.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (filter.page - 1) * pageSize,
      take: pageSize,
      include: {
        vehicle: { select: { make: true, model: true, registrationNumber: true } },
        booking: { select: { reference: true } },
        reportedBy: { select: { name: true } },
      },
    }),
  ]);
  return { total, incidents, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function listIncidentsForBooking(bookingId: string) {
  return db.incident.findMany({ where: { bookingId }, orderBy: { createdAt: "desc" } });
}
