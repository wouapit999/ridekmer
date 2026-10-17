"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { FileRejectedError, StorageUnavailableError } from "@/server/files/service";
import { getCurrentSession, requirePermissionOrThrow } from "@/server/auth/session";
import { enforceRateLimit, RateLimitedError } from "@/server/security/rate-limit";
import { db } from "@/server/db";

import {
  IncidentError,
  recordIncidentResolution,
  reportIncident,
  transitionIncident,
  upsertInsuranceClaim,
} from "./service";

export interface IncidentActionResult {
  ok: boolean;
  message?: string;
  incidentId?: string;
}

function fail(error: unknown): IncidentActionResult {
  if (error instanceof IncidentError) return { ok: false, message: error.code };
  if (error instanceof FileRejectedError) return { ok: false, message: "FILE_REJECTED" };
  if (error instanceof StorageUnavailableError) return { ok: false, message: error.code };
  if (error instanceof RateLimitedError) return { ok: false, message: "RATE_LIMITED" };
  throw error;
}

function revalidate() {
  revalidatePath("/[locale]/admin/incidents", "layout");
  revalidatePath("/[locale]/admin/bookings", "layout");
  revalidatePath("/[locale]/account/bookings", "layout");
}

const reportSchema = z.object({
  bookingId: z.string().min(1).optional(),
  vehicleId: z.string().min(1).optional(),
  type: z.enum(["ACCIDENT", "DAMAGE", "BREAKDOWN", "THEFT", "OTHER"]),
  occurredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  description: z.string().trim().min(10).max(3000),
  locationDescription: z.string().trim().max(300).optional(),
  policeReportNumber: z.string().trim().max(80).optional(),
});

export async function reportIncidentAction(
  _prev: IncidentActionResult,
  formData: FormData,
): Promise<IncidentActionResult> {
  const current = await getCurrentSession();
  if (!current) return { ok: false, message: "UNAUTHENTICATED" };
  const raw = Object.fromEntries(formData.entries());
  const parsed = reportSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: "INVALID" };
  const photos = formData
    .getAll("photos")
    .filter((f): f is File => f instanceof File && f.size > 0)
    .slice(0, 6);
  const staff = formData.get("asStaff") === "1";
  try {
    if (!staff) await enforceRateLimit("incident.report", current.user.id);
    let vehicleId = parsed.data.vehicleId;
    if (staff) {
      await requirePermissionOrThrow("incident.manage");
    }
    if (parsed.data.bookingId) {
      const booking = await db.booking.findUnique({
        where: { id: parsed.data.bookingId },
        select: { vehicleId: true },
      });
      if (!booking) return { ok: false, message: "NOT_FOUND" };
      vehicleId = booking.vehicleId;
    }
    if (!vehicleId) return { ok: false, message: "INVALID" };
    const { fromDoualaLocal } = await import("@/lib/dates");
    const incident = await reportIncident({
      vehicleId,
      bookingId: parsed.data.bookingId ?? null,
      type: parsed.data.type,
      occurredAt: fromDoualaLocal(parsed.data.occurredAt),
      description: parsed.data.description,
      locationDescription: parsed.data.locationDescription || null,
      policeReportNumber: parsed.data.policeReportNumber || null,
      reporterId: current.user.id,
      asCustomer: !staff,
      photos,
      blockVehicle: staff && formData.get("blockVehicle") === "1",
    });
    revalidate();
    return { ok: true, message: "REPORTED", incidentId: incident.id };
  } catch (error) {
    return fail(error);
  }
}

export async function transitionIncidentAction(
  _prev: IncidentActionResult,
  formData: FormData,
): Promise<IncidentActionResult> {
  const { user } = await requirePermissionOrThrow("incident.manage");
  const to = z
    .enum([
      "REPORTED",
      "UNDER_REVIEW",
      "AWAITING_DOCUMENTS",
      "RESPONSIBILITY_REVIEW",
      "DISPUTED",
      "RESOLVED",
      "CLOSED",
    ])
    .safeParse(formData.get("to"));
  if (!to.success) return { ok: false, message: "INVALID" };
  try {
    await transitionIncident({
      incidentId: String(formData.get("incidentId") ?? ""),
      to: to.data,
      actorId: user.id,
      note:
        String(formData.get("note") ?? "")
          .trim()
          .slice(0, 500) || null,
    });
    revalidate();
    return { ok: true, message: to.data };
  } catch (error) {
    return fail(error);
  }
}

const resolutionSchema = z.object({
  incidentId: z.string().min(1),
  repairEstimateXaf: z.coerce.number().int().min(0).optional(),
  customerLiableXaf: z.coerce.number().int().min(0).optional(),
  depositDeductionXaf: z.coerce.number().int().min(0).optional(),
  responsibilityNotes: z.string().trim().max(2000).optional(),
  resolutionNotes: z.string().trim().max(2000).optional(),
});

export async function incidentResolutionAction(
  _prev: IncidentActionResult,
  formData: FormData,
): Promise<IncidentActionResult> {
  const { user } = await requirePermissionOrThrow("incident.resolve");
  const raw = Object.fromEntries([...formData.entries()].filter(([, v]) => v !== ""));
  const parsed = resolutionSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: "INVALID" };
  try {
    await recordIncidentResolution({ ...parsed.data, actorId: user.id });
    revalidate();
    return { ok: true, message: "RESOLUTION_SAVED" };
  } catch (error) {
    return fail(error);
  }
}

const claimSchema = z.object({
  incidentId: z.string().min(1),
  claimId: z.string().optional(),
  insurerName: z.string().trim().min(2).max(120),
  claimReference: z.string().trim().max(80).optional(),
  status: z.enum(["DRAFT", "SUBMITTED", "IN_PROGRESS", "SETTLED", "REJECTED", "CLOSED"]),
  claimedXaf: z.coerce.number().int().min(0).optional(),
  settledXaf: z.coerce.number().int().min(0).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export async function insuranceClaimAction(
  _prev: IncidentActionResult,
  formData: FormData,
): Promise<IncidentActionResult> {
  const { user } = await requirePermissionOrThrow("incident.resolve");
  const raw = Object.fromEntries([...formData.entries()].filter(([, v]) => v !== ""));
  const parsed = claimSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: "INVALID" };
  try {
    await upsertInsuranceClaim({ ...parsed.data, actorId: user.id });
    revalidate();
    return { ok: true, message: "CLAIM_SAVED" };
  } catch (error) {
    return fail(error);
  }
}
