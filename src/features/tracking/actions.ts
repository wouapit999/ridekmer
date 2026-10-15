"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { fromDoualaLocal } from "@/lib/dates";
import { requirePermissionOrThrow } from "@/server/auth/session";

import { TrackingError, assignDevice, registerDevice, unassignDevice } from "./devices";
import { saveGeofence } from "./geofences";
import {
  cancelImmobilisation,
  confirmStationary,
  decideImmobilisation,
  executeImmobilisation,
  requestImmobilisation,
} from "./immobilisation";

export interface TrackingActionResult {
  ok: boolean;
  message?: string;
}

function fail(error: unknown): TrackingActionResult {
  if (error instanceof TrackingError) return { ok: false, message: error.code };
  if (error instanceof Error && error.message === "INVALID_GEOMETRY")
    return { ok: false, message: "INVALID_GEOMETRY" };
  throw error;
}

function revalidate() {
  revalidatePath("/[locale]/admin/fleet", "layout");
  revalidatePath("/[locale]/admin/devices", "page");
  revalidatePath("/[locale]/admin/geofences", "page");
  revalidatePath("/[locale]/admin/immobilisation", "page");
  revalidatePath("/[locale]/admin/vehicles", "layout");
}

const deviceSchema = z.object({
  type: z.enum(["COMMERCIAL_GPS", "SECONDARY_RECOVERY_TAG"]),
  provider: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/),
  externalDeviceId: z.string().trim().min(2).max(80),
  model: z.string().trim().max(80).optional(),
  serialNumber: z.string().trim().max(80).optional(),
  simNumber: z.string().trim().max(40).optional(),
});

export async function registerDeviceAction(
  _prev: TrackingActionResult,
  formData: FormData,
): Promise<TrackingActionResult> {
  const { user } = await requirePermissionOrThrow("tracking.manage_devices");
  const parsed = deviceSchema.safeParse(
    Object.fromEntries([...formData.entries()].filter(([, v]) => v !== "")),
  );
  if (!parsed.success) return { ok: false, message: "INVALID" };
  try {
    await registerDevice({ ...parsed.data, actorId: user.id });
    revalidate();
    return { ok: true, message: "DEVICE_REGISTERED" };
  } catch (error) {
    return fail(error);
  }
}

const assignSchema = z.object({
  deviceId: z.string().min(1),
  vehicleId: z.string().min(1),
  ownerConsentAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  consentNotes: z.string().trim().max(500).optional(),
  installationNotes: z.string().trim().max(500).optional(),
});

export async function assignDeviceAction(
  _prev: TrackingActionResult,
  formData: FormData,
): Promise<TrackingActionResult> {
  const { user } = await requirePermissionOrThrow("tracking.manage_devices");
  const parsed = assignSchema.safeParse(
    Object.fromEntries([...formData.entries()].filter(([, v]) => v !== "")),
  );
  if (!parsed.success) return { ok: false, message: "INVALID" };
  try {
    await assignDevice({
      deviceId: parsed.data.deviceId,
      vehicleId: parsed.data.vehicleId,
      ownerConsentAt: parsed.data.ownerConsentAt
        ? fromDoualaLocal(`${parsed.data.ownerConsentAt}T00:00`)
        : null,
      consentNotes: parsed.data.consentNotes ?? null,
      installationNotes: parsed.data.installationNotes ?? null,
      actorId: user.id,
    });
    revalidate();
    return { ok: true, message: "DEVICE_ASSIGNED" };
  } catch (error) {
    return fail(error);
  }
}

export async function unassignDeviceAction(
  _prev: TrackingActionResult,
  formData: FormData,
): Promise<TrackingActionResult> {
  const { user } = await requirePermissionOrThrow("tracking.manage_devices");
  try {
    await unassignDevice({
      deviceId: String(formData.get("deviceId") ?? ""),
      actorId: user.id,
      reason:
        String(formData.get("reason") ?? "")
          .trim()
          .slice(0, 300) || null,
      removed: formData.get("removed") === "1",
    });
    revalidate();
    return { ok: true, message: "DEVICE_UNASSIGNED" };
  } catch (error) {
    return fail(error);
  }
}

const geofenceSchema = z.object({
  geofenceId: z.string().optional(),
  name: z.string().trim().min(2).max(80),
  type: z.enum(["CITY", "BRANCH", "CUSTOM", "RESTRICTED"]),
  cityId: z.string().optional(),
  shape: z.enum(["circle", "polygon"]),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  radiusMeters: z.coerce.number().int().min(50).max(500_000).optional(),
  ring: z.string().trim().max(5000).optional(),
});

export async function saveGeofenceAction(
  _prev: TrackingActionResult,
  formData: FormData,
): Promise<TrackingActionResult> {
  const { user } = await requirePermissionOrThrow("tracking.manage_devices");
  const parsed = geofenceSchema.safeParse(
    Object.fromEntries([...formData.entries()].filter(([, v]) => v !== "")),
  );
  if (!parsed.success) return { ok: false, message: "INVALID" };
  const d = parsed.data;
  let geometry;
  if (d.shape === "circle") {
    if (d.latitude === undefined || d.longitude === undefined || d.radiusMeters === undefined)
      return { ok: false, message: "INVALID_GEOMETRY" };
    geometry = {
      kind: "circle" as const,
      center: { latitude: d.latitude, longitude: d.longitude },
      radiusMeters: d.radiusMeters,
    };
  } else {
    const ring = (d.ring ?? "")
      .split(/\n|;/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => l.split(",").map((n) => Number(n.trim())))
      .filter((p): p is [number, number] => p.length === 2 && p.every((n) => Number.isFinite(n)));
    if (ring.length < 3) return { ok: false, message: "INVALID_GEOMETRY" };
    geometry = { kind: "polygon" as const, ring };
  }
  try {
    await saveGeofence({
      geofenceId: d.geofenceId ?? null,
      name: d.name,
      type: d.type,
      cityId: d.cityId ?? null,
      geometry,
      alertOnExit: formData.get("alertOnExit") === "1",
      isActive: formData.get("isActive") !== "0",
      actorId: user.id,
    });
    revalidate();
    return { ok: true, message: "GEOFENCE_SAVED" };
  } catch (error) {
    return fail(error);
  }
}

export async function requestImmobilisationAction(
  _prev: TrackingActionResult,
  formData: FormData,
): Promise<TrackingActionResult> {
  const { user } = await requirePermissionOrThrow("immobilisation.request");
  try {
    await requestImmobilisation({
      vehicleId: String(formData.get("vehicleId") ?? ""),
      reason: String(formData.get("reason") ?? ""),
      actorId: user.id,
    });
    revalidate();
    return { ok: true, message: "IMMOB_REQUESTED" };
  } catch (error) {
    return fail(error);
  }
}

export async function immobilisationStepAction(
  _prev: TrackingActionResult,
  formData: FormData,
): Promise<TrackingActionResult> {
  const step = String(formData.get("step") ?? "");
  const requestId = String(formData.get("requestId") ?? "");
  try {
    if (step === "stationary") {
      const { user } = await requirePermissionOrThrow("immobilisation.request");
      await confirmStationary({ requestId, actorId: user.id });
    } else if (step === "approve" || step === "reject") {
      const { user } = await requirePermissionOrThrow("immobilisation.approve");
      await decideImmobilisation({
        requestId,
        approverId: user.id,
        decision: step === "approve" ? "APPROVED" : "REJECTED",
        comment:
          String(formData.get("comment") ?? "")
            .trim()
            .slice(0, 300) || null,
      });
    } else if (step === "execute") {
      const { user } = await requirePermissionOrThrow("immobilisation.approve");
      await executeImmobilisation({ requestId, actorId: user.id });
    } else if (step === "cancel") {
      const { user } = await requirePermissionOrThrow("immobilisation.request");
      await cancelImmobilisation({
        requestId,
        actorId: user.id,
        reason:
          String(formData.get("comment") ?? "")
            .trim()
            .slice(0, 300) || null,
      });
    } else return { ok: false, message: "INVALID" };
    revalidate();
    return { ok: true, message: `IMMOB_${step.toUpperCase()}` };
  } catch (error) {
    return fail(error);
  }
}
