"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { z } from "zod";

import { FileRejectedError, StorageUnavailableError } from "@/server/files/service";
import { getCurrentSession, requirePermissionOrThrow } from "@/server/auth/session";

import { settleReturnDeposit } from "./deposit";
import { CHECK_AREAS, damageSchema, inspectionDetailsSchema, type CheckGroup } from "./schemas";
import {
  InspectionError,
  addDamage,
  addInspectionPhoto,
  customerAcknowledgeInspection,
  removeDamage,
  saveInspectionDetails,
  startInspection,
  submitInspection,
} from "./service";

export interface InspectionActionResult {
  ok: boolean;
  message?: string;
  errors?: Record<string, string>;
}

function fail(error: unknown): InspectionActionResult {
  if (error instanceof InspectionError) return { ok: false, message: error.code };
  if (error instanceof FileRejectedError) return { ok: false, message: "FILE_REJECTED" };
  if (error instanceof StorageUnavailableError) return { ok: false, message: error.code };
  if (error instanceof Error && error.name === "RefundError")
    return { ok: false, message: "REFUND_ERROR" };
  throw error;
}

function revalidate() {
  revalidatePath("/[locale]/admin/inspections", "layout");
  revalidatePath("/[locale]/admin/bookings", "layout");
  revalidatePath("/[locale]/admin/vehicles", "layout");
  revalidatePath("/[locale]/account/bookings", "layout");
}

/** Staff: start (or resume) an inspection and open its page. */
export async function startInspectionAction(formData: FormData): Promise<void> {
  const { user } = await requirePermissionOrThrow("inspection.perform");
  const vehicleId = String(formData.get("vehicleId") ?? "");
  const bookingId = String(formData.get("bookingId") ?? "") || null;
  const type = z.enum(["PICKUP", "RETURN", "PERIODIC"]).parse(formData.get("type"));
  const inspection = await startInspection({ vehicleId, bookingId, type, inspectorId: user.id });
  const locale = await getLocale();
  redirect(`/${locale}/admin/inspections/${inspection.id}`);
}

export async function saveInspectionDetailsAction(
  _prev: InspectionActionResult,
  formData: FormData,
): Promise<InspectionActionResult> {
  const { user } = await requirePermissionOrThrow("inspection.perform");
  const parsed = inspectionDetailsSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success)
    return {
      ok: false,
      message: "INVALID",
      errors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.code])),
    };
  const checks: Partial<Record<CheckGroup, Record<string, string>>> = {};
  for (const group of Object.keys(CHECK_AREAS) as CheckGroup[]) {
    checks[group] = {};
    for (const area of CHECK_AREAS[group]) {
      const v = formData.get(`check:${group}:${area}`);
      if (typeof v === "string" && v) checks[group]![area] = v;
    }
  }
  try {
    await saveInspectionDetails({ ...parsed.data, actorId: user.id, checks });
    revalidate();
    return { ok: true, message: "SAVED" };
  } catch (error) {
    return fail(error);
  }
}

export async function addInspectionPhotoAction(
  _prev: InspectionActionResult,
  formData: FormData,
): Promise<InspectionActionResult> {
  const { user } = await requirePermissionOrThrow("inspection.perform");
  const inspectionId = String(formData.get("inspectionId") ?? "");
  const area = String(formData.get("area") ?? "") || null;
  const files = formData.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { ok: false, message: "NO_FILE" };
  try {
    for (const file of files.slice(0, 10)) {
      await addInspectionPhoto({ inspectionId, actorId: user.id, file, area });
    }
    revalidate();
    return { ok: true, message: "PHOTOS_ADDED" };
  } catch (error) {
    return fail(error);
  }
}

export async function addDamageAction(
  _prev: InspectionActionResult,
  formData: FormData,
): Promise<InspectionActionResult> {
  const { user } = await requirePermissionOrThrow("inspection.perform");
  const raw = Object.fromEntries(formData.entries());
  const parsed = damageSchema.safeParse({ ...raw, isPreExisting: raw.isPreExisting === "1" });
  if (!parsed.success) return { ok: false, message: "INVALID" };
  try {
    await addDamage({ ...parsed.data, actorId: user.id });
    revalidate();
    return { ok: true, message: "DAMAGE_ADDED" };
  } catch (error) {
    return fail(error);
  }
}

export async function removeDamageAction(formData: FormData): Promise<void> {
  const { user } = await requirePermissionOrThrow("inspection.perform");
  await removeDamage(String(formData.get("damageId") ?? ""), user.id);
  revalidate();
}

export async function submitInspectionAction(
  _prev: InspectionActionResult,
  formData: FormData,
): Promise<InspectionActionResult> {
  const { user } = await requirePermissionOrThrow("inspection.perform");
  try {
    await submitInspection(String(formData.get("inspectionId") ?? ""), user.id);
    revalidate();
    return { ok: true, message: "SUBMITTED" };
  } catch (error) {
    return fail(error);
  }
}

export async function customerInspectionDecisionAction(
  _prev: InspectionActionResult,
  formData: FormData,
): Promise<InspectionActionResult> {
  const current = await getCurrentSession();
  if (!current) return { ok: false, message: "UNAUTHENTICATED" };
  const decision = formData.get("decision") === "DISPUTE" ? "DISPUTE" : "ACKNOWLEDGE";
  const note = String(formData.get("note") ?? "")
    .trim()
    .slice(0, 1000);
  if (decision === "DISPUTE" && note.length < 3) return { ok: false, message: "NOTE_REQUIRED" };
  const h = await headers();
  try {
    await customerAcknowledgeInspection({
      inspectionId: String(formData.get("inspectionId") ?? ""),
      userId: current.user.id,
      decision,
      note: note || undefined,
      evidence: {
        ipAddress: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
        userAgent: h.get("user-agent") ?? undefined,
      },
    });
    revalidate();
    return { ok: true, message: decision === "DISPUTE" ? "DISPUTED" : "ACKNOWLEDGED" };
  } catch (error) {
    return fail(error);
  }
}

export async function settleDepositAction(
  _prev: InspectionActionResult,
  formData: FormData,
): Promise<InspectionActionResult> {
  const { user } = await requirePermissionOrThrow("refund.request");
  try {
    const result = await settleReturnDeposit(String(formData.get("bookingId") ?? ""), user.id);
    revalidate();
    revalidatePath("/[locale]/admin/payments", "layout");
    return { ok: true, message: result.additionalChargeXaf > 0 ? "SETTLED_CHARGE" : "SETTLED" };
  } catch (error) {
    return fail(error);
  }
}
