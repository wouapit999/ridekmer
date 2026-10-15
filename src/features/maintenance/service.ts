import { addDays } from "date-fns";

import { formatIsoDate } from "@/lib/dates";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/server/audit";
import { db } from "@/server/db";
import { sendTemplatedNotification } from "@/server/notifications";

import type { MaintenanceStatus, MaintenanceType } from "@/generated/prisma/enums";

import { MAINTENANCE_TRANSITIONS } from "./state-machine";

export { MAINTENANCE_TRANSITIONS };

export class MaintenanceError extends Error {
  constructor(
    public readonly code:
      "NOT_FOUND" | "FORBIDDEN" | "INVALID_STATUS" | "BOOKING_CONFLICT" | "INVALID",
    message?: string,
  ) {
    super(message ?? code);
    this.name = "MaintenanceError";
  }
}

// ─── Schedules ───────────────────────────────────────────────────────────────

export async function upsertSchedule(input: {
  scheduleId?: string | null;
  vehicleId: string;
  type: MaintenanceType;
  intervalDays?: number | null;
  intervalKm?: number | null;
  nextDueDate?: Date | null;
  nextDueKm?: number | null;
  reminderDaysBefore?: number;
  reminderKmBefore?: number;
  isActive?: boolean;
  actorId: string;
}) {
  if (!input.intervalDays && !input.intervalKm && !input.nextDueDate && !input.nextDueKm)
    throw new MaintenanceError("INVALID", "interval or due value required");
  const data = {
    type: input.type,
    intervalDays: input.intervalDays ?? null,
    intervalKm: input.intervalKm ?? null,
    nextDueDate: input.nextDueDate ?? null,
    nextDueKm: input.nextDueKm ?? null,
    reminderDaysBefore: input.reminderDaysBefore ?? 14,
    reminderKmBefore: input.reminderKmBefore ?? 500,
    isActive: input.isActive ?? true,
  };
  const schedule = input.scheduleId
    ? await db.maintenanceSchedule.update({ where: { id: input.scheduleId }, data })
    : await db.maintenanceSchedule.create({ data: { vehicleId: input.vehicleId, ...data } });
  await recordAudit({
    actorId: input.actorId,
    action: "maintenance.schedule.save",
    entityType: "MaintenanceSchedule",
    entityId: schedule.id,
    after: data,
  });
  return schedule;
}

// ─── Records ─────────────────────────────────────────────────────────────────

export async function createMaintenanceRecord(input: {
  vehicleId: string;
  type: MaintenanceType;
  title: string;
  description?: string | null;
  scheduledFor?: Date | null;
  providerName?: string | null;
  providerContact?: string | null;
  quoteXaf?: number | null;
  downtimeStart?: Date | null;
  downtimeEnd?: Date | null;
  actorId: string;
}) {
  const vehicle = await db.vehicle.findUnique({
    where: { id: input.vehicleId },
    include: { managementConfig: true, ownerProfile: { select: { id: true } } },
  });
  if (!vehicle) throw new MaintenanceError("NOT_FOUND");
  const threshold = vehicle.managementConfig?.ownerApprovesExpensesAboveXaf ?? null;
  const needsOwnerApproval =
    vehicle.ownerProfile !== null &&
    threshold !== null &&
    input.quoteXaf !== null &&
    input.quoteXaf !== undefined &&
    input.quoteXaf > threshold;
  const record = await db.maintenanceRecord.create({
    data: {
      vehicleId: input.vehicleId,
      type: input.type,
      status: needsOwnerApproval ? "AWAITING_OWNER_APPROVAL" : "SCHEDULED",
      title: input.title,
      description: input.description ?? null,
      scheduledFor: input.scheduledFor ?? null,
      providerName: input.providerName ?? null,
      providerContact: input.providerContact ?? null,
      quoteXaf: input.quoteXaf ?? null,
      downtimeStart: input.downtimeStart ?? null,
      downtimeEnd: input.downtimeEnd ?? null,
      createdById: input.actorId,
    },
  });
  await recordAudit({
    actorId: input.actorId,
    action: "maintenance.create",
    entityType: "MaintenanceRecord",
    entityId: record.id,
    after: { type: input.type, status: record.status, quoteXaf: input.quoteXaf ?? null },
  });
  if (needsOwnerApproval) await notifyOwner(record.id, "approval_requested");
  return record;
}

/** Owner approves or declines a quote above their threshold (object-level check). */
export async function ownerDecideMaintenance(input: {
  recordId: string;
  ownerUserId: string;
  approve: boolean;
  note?: string | null;
}) {
  const record = await db.maintenanceRecord.findUnique({
    where: { id: input.recordId },
    include: { vehicle: { include: { ownerProfile: { select: { userId: true } } } } },
  });
  if (!record || record.vehicle.ownerProfile?.userId !== input.ownerUserId)
    throw new MaintenanceError("NOT_FOUND");
  if (record.status !== "AWAITING_OWNER_APPROVAL") throw new MaintenanceError("INVALID_STATUS");
  const updated = await db.maintenanceRecord.update({
    where: { id: record.id },
    data: input.approve
      ? { status: "APPROVED", ownerApprovedAt: new Date(), ownerApprovedBy: input.ownerUserId }
      : {
          status: "CANCELLED",
          description: [record.description, `owner declined: ${input.note ?? ""}`]
            .filter(Boolean)
            .join("\n"),
        },
  });
  await recordAudit({
    actorId: input.ownerUserId,
    action: input.approve ? "maintenance.owner_approve" : "maintenance.owner_decline",
    entityType: "MaintenanceRecord",
    entityId: record.id,
    reason: input.note ?? null,
  });
  return updated;
}

/**
 * Staff transition. Entering IN_PROGRESS blocks the vehicle for the downtime window (default:
 * now → +1 day) unless a confirmed booking overlaps; COMPLETED releases the block, records the
 * cost as an expense, updates mileage and rolls the matching schedule forward.
 */
export async function transitionMaintenance(input: {
  recordId: string;
  to: MaintenanceStatus;
  actorId: string;
  finalCostXaf?: number | null;
  mileageKm?: number | null;
  downtimeStart?: Date | null;
  downtimeEnd?: Date | null;
  note?: string | null;
}) {
  const record = await db.maintenanceRecord.findUnique({
    where: { id: input.recordId },
    include: { vehicle: true },
  });
  if (!record) throw new MaintenanceError("NOT_FOUND");
  if (!MAINTENANCE_TRANSITIONS[record.status].includes(input.to))
    throw new MaintenanceError("INVALID_STATUS");
  const now = new Date();

  const updated = await db.$transaction(async (tx) => {
    let availabilityBlockId = record.availabilityBlockId;
    if (input.to === "IN_PROGRESS") {
      const startAt = input.downtimeStart ?? record.downtimeStart ?? now;
      const endAt = input.downtimeEnd ?? record.downtimeEnd ?? addDays(startAt, 1);
      const conflicts = await tx.booking.count({
        where: {
          vehicleId: record.vehicleId,
          status: { in: ["CONFIRMED", "READY_FOR_PICKUP", "ACTIVE", "EXTENSION_REQUESTED"] },
          startAt: { lt: endAt },
          endAt: { gt: startAt },
        },
      });
      if (conflicts > 0) throw new MaintenanceError("BOOKING_CONFLICT");
      const block = await tx.vehicleAvailability.create({
        data: {
          vehicleId: record.vehicleId,
          type: "MAINTENANCE",
          startAt,
          endAt,
          reason: `maintenance ${record.title}`,
          createdBy: input.actorId,
        },
      });
      availabilityBlockId = block.id;
    }
    if ((input.to === "COMPLETED" || input.to === "CANCELLED") && availabilityBlockId) {
      // Release the downtime block: shorten a running block to now, drop one not yet started
      // (a block must keep startAt < endAt).
      const block = await tx.vehicleAvailability.findUnique({ where: { id: availabilityBlockId } });
      if (block && block.endAt > now) {
        if (block.startAt >= now) {
          await tx.vehicleAvailability.delete({ where: { id: block.id } });
        } else {
          await tx.vehicleAvailability.update({ where: { id: block.id }, data: { endAt: now } });
        }
      }
    }
    const u = await tx.maintenanceRecord.update({
      where: { id: record.id },
      data: {
        status: input.to,
        startedAt: input.to === "IN_PROGRESS" ? now : record.startedAt,
        completedAt: input.to === "COMPLETED" ? now : record.completedAt,
        finalCostXaf: input.finalCostXaf ?? record.finalCostXaf,
        mileageKm: input.mileageKm ?? record.mileageKm,
        downtimeStart: input.downtimeStart ?? record.downtimeStart,
        downtimeEnd: input.to === "COMPLETED" ? now : (input.downtimeEnd ?? record.downtimeEnd),
        availabilityBlockId,
        description: input.note
          ? [record.description, input.note].filter(Boolean).join("\n")
          : record.description,
      },
    });
    if (input.to === "COMPLETED") {
      if (input.mileageKm)
        await tx.vehicle.updateMany({
          where: { id: record.vehicleId, currentMileageKm: { lt: input.mileageKm } },
          data: { currentMileageKm: input.mileageKm },
        });
      const cost = input.finalCostXaf ?? record.finalCostXaf ?? record.quoteXaf;
      if (cost && cost > 0) {
        const ownerPays = record.vehicle.ownerProfileId !== null;
        await tx.expense.create({
          data: {
            vehicleId: record.vehicleId,
            ownerProfileId: record.vehicle.ownerProfileId,
            maintenanceRecordId: record.id,
            status: "PENDING",
            allocation: ownerPays ? "OWNER" : "RIDEKMER",
            category: record.type,
            description: record.title,
            amountXaf: cost,
            ownerShareXaf: ownerPays ? cost : 0,
            ridekmerShareXaf: ownerPays ? 0 : cost,
            incurredOn: now,
          },
        });
      }
      const schedule = await tx.maintenanceSchedule.findFirst({
        where: { vehicleId: record.vehicleId, type: record.type, isActive: true },
      });
      if (schedule) {
        const km = input.mileageKm ?? record.mileageKm ?? record.vehicle.currentMileageKm;
        await tx.maintenanceSchedule.update({
          where: { id: schedule.id },
          data: {
            lastDoneAt: now,
            lastDoneKm: km,
            nextDueDate: schedule.intervalDays
              ? addDays(now, schedule.intervalDays)
              : schedule.nextDueDate,
            nextDueKm: schedule.intervalKm ? km + schedule.intervalKm : schedule.nextDueKm,
          },
        });
      }
    }
    return u;
  });
  await recordAudit({
    actorId: input.actorId,
    action: `maintenance.${input.to.toLowerCase()}`,
    entityType: "MaintenanceRecord",
    entityId: record.id,
    before: { status: record.status },
    after: { status: input.to, finalCostXaf: input.finalCostXaf ?? null },
    reason: input.note ?? null,
  });
  if (input.to === "COMPLETED" || input.to === "IN_PROGRESS")
    await notifyOwner(record.id, input.to.toLowerCase());
  return updated;
}

async function notifyOwner(recordId: string, status: string) {
  const record = await db.maintenanceRecord.findUnique({
    where: { id: recordId },
    include: {
      vehicle: {
        include: {
          ownerProfile: {
            include: {
              user: { select: { id: true, name: true, email: true, preferredLocale: true } },
            },
          },
        },
      },
    },
  });
  const owner = record?.vehicle.ownerProfile?.user;
  if (!record || !owner) return;
  const locale = owner.preferredLocale === "en" ? "en" : "fr";
  await sendTemplatedNotification({
    templateKey: "maintenance_update",
    channel: "EMAIL",
    locale,
    to: owner.email,
    userId: owner.id,
    variables: {
      name: owner.name,
      vehicle: `${record.vehicle.make} ${record.vehicle.model} (${record.vehicle.registrationNumber})`,
      title: record.title,
      status,
    },
    entityType: "MaintenanceRecord",
    entityId: record.id,
    dedupeKey: `maintenance_${status}:${record.id}`,
  });
}

// ─── Reminders (cron) ────────────────────────────────────────────────────────

/** Daily: schedules due by date or mileage within their reminder window → one reminder a day. */
export async function sendMaintenanceReminders(now = new Date()) {
  const schedules = await db.maintenanceSchedule.findMany({
    where: {
      isActive: true,
      vehicle: {
        deletedAt: null,
        status: { in: ["ACTIVE", "APPROVED", "SUSPENDED", "UNAVAILABLE_DOCUMENTS"] },
      },
    },
    include: {
      vehicle: {
        include: {
          ownerProfile: {
            include: {
              user: { select: { id: true, name: true, email: true, preferredLocale: true } },
            },
          },
        },
      },
    },
  });
  let reminders = 0;
  const due: string[] = [];
  for (const s of schedules) {
    const byDate = s.nextDueDate ? addDays(s.nextDueDate, -s.reminderDaysBefore) <= now : false;
    const byKm =
      s.nextDueKm !== null ? s.vehicle.currentMileageKm >= s.nextDueKm - s.reminderKmBefore : false;
    if (!byDate && !byKm) continue;
    due.push(s.id);
    const open = await db.maintenanceRecord.count({
      where: {
        vehicleId: s.vehicleId,
        type: s.type,
        status: {
          in: [
            "SCHEDULED",
            "QUOTE_REQUESTED",
            "AWAITING_OWNER_APPROVAL",
            "APPROVED",
            "IN_PROGRESS",
          ],
        },
      },
    });
    if (open > 0) continue;
    const owner = s.vehicle.ownerProfile?.user;
    const title = `${s.type} due ${s.nextDueDate ? formatIsoDate(s.nextDueDate) : ""}${s.nextDueKm ? ` / ${s.nextDueKm} km` : ""}`;
    const dedupe = `maintenance_reminder:${s.id}:${formatIsoDate(now)}`;
    if (owner) {
      await sendTemplatedNotification({
        templateKey: "maintenance_update",
        channel: "EMAIL",
        locale: owner.preferredLocale === "en" ? "en" : "fr",
        to: owner.email,
        userId: owner.id,
        variables: {
          name: owner.name,
          vehicle: `${s.vehicle.make} ${s.vehicle.model} (${s.vehicle.registrationNumber})`,
          title,
          status: "reminder",
        },
        entityType: "MaintenanceSchedule",
        entityId: s.id,
        dedupeKey: dedupe,
      });
    }
    await db.notification
      .create({
        data: {
          channel: "IN_APP",
          templateKey: "maintenance_update",
          locale: "fr",
          subject: "Maintenance due",
          body: `${s.vehicle.registrationNumber}: ${title}`,
          status: "SENT",
          provider: "in-app",
          entityType: "MaintenanceSchedule",
          entityId: s.id,
          dedupeKey: `${dedupe}:staff`,
          sentAt: now,
        },
      })
      .catch(() => undefined);
    reminders += 1;
  }
  logger.info("cron.maintenance_reminders", { due: due.length, reminders });
  return { due: due.length, reminders };
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export async function listMaintenanceForVehicle(vehicleId: string) {
  const [schedules, records] = await Promise.all([
    db.maintenanceSchedule.findMany({ where: { vehicleId }, orderBy: { type: "asc" } }),
    db.maintenanceRecord.findMany({
      where: { vehicleId },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { createdBy: { select: { name: true } } },
    }),
  ]);
  return { schedules, records };
}

export async function listMaintenanceForAdmin(
  filter: { status?: MaintenanceStatus | "ALL"; page: number },
  pageSize = 25,
) {
  const where = filter.status && filter.status !== "ALL" ? { status: filter.status } : {};
  const [total, records, dueSoon] = await Promise.all([
    db.maintenanceRecord.count({ where }),
    db.maintenanceRecord.findMany({
      where,
      orderBy: [{ scheduledFor: "asc" }, { createdAt: "desc" }],
      skip: (filter.page - 1) * pageSize,
      take: pageSize,
      include: {
        vehicle: { select: { id: true, make: true, model: true, registrationNumber: true } },
      },
    }),
    db.maintenanceSchedule.findMany({
      where: {
        isActive: true,
        OR: [{ nextDueDate: { lte: addDays(new Date(), 30) } }, { nextDueKm: { not: null } }],
      },
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
      },
      orderBy: { nextDueDate: "asc" },
      take: 50,
    }),
  ]);
  return {
    total,
    records,
    pages: Math.max(1, Math.ceil(total / pageSize)),
    dueSoon: dueSoon.filter(
      (s) =>
        (s.nextDueDate ? s.nextDueDate <= addDays(new Date(), 30) : false) ||
        (s.nextDueKm !== null && s.vehicle.currentMileageKm >= s.nextDueKm - s.reminderKmBefore),
    ),
  };
}
