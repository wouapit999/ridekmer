"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { fromDoualaLocal } from "@/lib/dates";
import { getCurrentSession, requirePermissionOrThrow } from "@/server/auth/session";

import {
  MaintenanceError,
  createMaintenanceRecord,
  ownerDecideMaintenance,
  transitionMaintenance,
  upsertSchedule,
} from "./service";

export interface MaintenanceActionResult {
  ok: boolean;
  message?: string;
}

function fail(error: unknown): MaintenanceActionResult {
  if (error instanceof MaintenanceError) return { ok: false, message: error.code };
  throw error;
}

function revalidate() {
  revalidatePath("/[locale]/admin/maintenance", "layout");
  revalidatePath("/[locale]/admin/vehicles", "layout");
  revalidatePath("/[locale]/owner/vehicles", "layout");
}

const TYPES = [
  "OIL_CHANGE",
  "TYRE_CHANGE",
  "BRAKES",
  "INSURANCE_RENEWAL",
  "TECHNICAL_INSPECTION",
  "REPAIR",
  "PERIODIC_SERVICE",
  "OTHER",
] as const;
const optionalInt = z.coerce.number().int().min(0).optional();
const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional();

const scheduleSchema = z.object({
  scheduleId: z.string().optional(),
  vehicleId: z.string().min(1),
  type: z.enum(TYPES),
  intervalDays: optionalInt,
  intervalKm: optionalInt,
  nextDueDate: optionalDate,
  nextDueKm: optionalInt,
  reminderDaysBefore: optionalInt,
  reminderKmBefore: optionalInt,
});

function clean(formData: FormData) {
  return Object.fromEntries([...formData.entries()].filter(([, v]) => v !== ""));
}

export async function saveScheduleAction(
  _prev: MaintenanceActionResult,
  formData: FormData,
): Promise<MaintenanceActionResult> {
  const { user } = await requirePermissionOrThrow("maintenance.manage");
  const parsed = scheduleSchema.safeParse(clean(formData));
  if (!parsed.success) return { ok: false, message: "INVALID" };
  try {
    await upsertSchedule({
      ...parsed.data,
      nextDueDate: parsed.data.nextDueDate
        ? fromDoualaLocal(`${parsed.data.nextDueDate}T00:00`)
        : null,
      isActive: formData.get("isActive") !== "0",
      actorId: user.id,
    });
    revalidate();
    return { ok: true, message: "SCHEDULE_SAVED" };
  } catch (error) {
    return fail(error);
  }
}

const recordSchema = z.object({
  vehicleId: z.string().min(1),
  type: z.enum(TYPES),
  title: z.string().trim().min(3).max(140),
  description: z.string().trim().max(2000).optional(),
  scheduledFor: optionalDate,
  providerName: z.string().trim().max(120).optional(),
  providerContact: z.string().trim().max(120).optional(),
  quoteXaf: optionalInt,
  downtimeStart: optionalDate,
  downtimeEnd: optionalDate,
});

export async function createRecordAction(
  _prev: MaintenanceActionResult,
  formData: FormData,
): Promise<MaintenanceActionResult> {
  const { user } = await requirePermissionOrThrow("maintenance.manage");
  const parsed = recordSchema.safeParse(clean(formData));
  if (!parsed.success) return { ok: false, message: "INVALID" };
  const d = parsed.data;
  try {
    await createMaintenanceRecord({
      ...d,
      scheduledFor: d.scheduledFor ? fromDoualaLocal(`${d.scheduledFor}T08:00`) : null,
      downtimeStart: d.downtimeStart ? fromDoualaLocal(`${d.downtimeStart}T00:00`) : null,
      downtimeEnd: d.downtimeEnd ? fromDoualaLocal(`${d.downtimeEnd}T23:59`) : null,
      actorId: user.id,
    });
    revalidate();
    return { ok: true, message: "RECORD_CREATED" };
  } catch (error) {
    return fail(error);
  }
}

const transitionSchema = z.object({
  recordId: z.string().min(1),
  to: z.enum([
    "QUOTE_REQUESTED",
    "AWAITING_OWNER_APPROVAL",
    "APPROVED",
    "IN_PROGRESS",
    "COMPLETED",
    "CANCELLED",
  ]),
  finalCostXaf: optionalInt,
  mileageKm: optionalInt,
  downtimeStart: optionalDate,
  downtimeEnd: optionalDate,
  note: z.string().trim().max(500).optional(),
});

export async function transitionRecordAction(
  _prev: MaintenanceActionResult,
  formData: FormData,
): Promise<MaintenanceActionResult> {
  const { user } = await requirePermissionOrThrow("maintenance.manage");
  const parsed = transitionSchema.safeParse(clean(formData));
  if (!parsed.success) return { ok: false, message: "INVALID" };
  const d = parsed.data;
  try {
    await transitionMaintenance({
      ...d,
      downtimeStart: d.downtimeStart ? fromDoualaLocal(`${d.downtimeStart}T00:00`) : null,
      downtimeEnd: d.downtimeEnd ? fromDoualaLocal(`${d.downtimeEnd}T23:59`) : null,
      actorId: user.id,
    });
    revalidate();
    return { ok: true, message: d.to };
  } catch (error) {
    return fail(error);
  }
}

export async function ownerDecideMaintenanceAction(
  _prev: MaintenanceActionResult,
  formData: FormData,
): Promise<MaintenanceActionResult> {
  const current = await getCurrentSession();
  if (!current) return { ok: false, message: "UNAUTHENTICATED" };
  try {
    await ownerDecideMaintenance({
      recordId: String(formData.get("recordId") ?? ""),
      ownerUserId: current.user.id,
      approve: formData.get("decision") === "APPROVE",
      note:
        String(formData.get("note") ?? "")
          .trim()
          .slice(0, 500) || null,
    });
    revalidate();
    return {
      ok: true,
      message: formData.get("decision") === "APPROVE" ? "OWNER_APPROVED" : "OWNER_DECLINED",
    };
  } catch (error) {
    return fail(error);
  }
}
