"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  DocumentError,
  createDocumentOverride,
  reviewVehicleDocument,
  reviewVerificationDocument,
  revokeDocumentOverride,
} from "@/features/documents/service";
import { decideOwnerKyc } from "@/features/owner/service";
import { decideCustomerCase } from "@/features/verification/service";
import { VehicleError, reviewVehicle } from "@/features/vehicles/service";
import { requirePermissionOrThrow } from "@/server/auth/session";
import { recordAudit } from "@/server/audit";
import { db } from "@/server/db";

export interface ReviewActionResult {
  ok: boolean;
  message?: string;
  details?: string[];
}

function fail(error: unknown): ReviewActionResult {
  if (error instanceof VehicleError)
    return { ok: false, message: error.code, details: error.details };
  if (error instanceof DocumentError) return { ok: false, message: error.code };
  if (error instanceof Error && /^(MISSING:|CASE_)/.test(error.message))
    return { ok: false, message: error.message };
  throw error;
}

const reasonSchema = z.string().trim().min(3).max(500);

export async function reviewVehicleAction(
  _prev: ReviewActionResult,
  formData: FormData,
): Promise<ReviewActionResult> {
  const decision = String(formData.get("decision") ?? "") as
    "UNDER_REVIEW" | "APPROVED" | "REJECTED" | "SUSPENDED" | "ACTIVE" | "WITHDRAWN";
  const permission =
    decision === "APPROVED" || decision === "REJECTED"
      ? "vehicle.approve"
      : decision === "UNDER_REVIEW"
        ? "vehicle.review"
        : decision === "WITHDRAWN"
          ? "vehicle.withdraw"
          : "vehicle.suspend";
  const { user } = await requirePermissionOrThrow(permission);
  const vehicleId = String(formData.get("vehicleId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (
    ["REJECTED", "SUSPENDED", "WITHDRAWN"].includes(decision) &&
    !reasonSchema.safeParse(reason).success
  )
    return { ok: false, message: "REASON_REQUIRED" };
  try {
    await reviewVehicle({ vehicleId, decision, reason: reason || undefined, actorId: user.id });
    revalidatePath("/[locale]/admin/vehicles", "layout");
    return { ok: true, message: decision };
  } catch (error) {
    return fail(error);
  }
}

export async function reviewVehicleDocumentAction(
  _prev: ReviewActionResult,
  formData: FormData,
): Promise<ReviewActionResult> {
  const { user } = await requirePermissionOrThrow("document.verify");
  const decision = String(formData.get("decision") ?? "") as
    "VERIFIED" | "REJECTED" | "UNDER_REVIEW";
  const reason = String(formData.get("reason") ?? "").trim();
  if (decision === "REJECTED" && !reasonSchema.safeParse(reason).success)
    return { ok: false, message: "REASON_REQUIRED" };
  try {
    await reviewVehicleDocument({
      documentId: String(formData.get("documentId") ?? ""),
      decision,
      reason: reason || undefined,
      reviewerId: user.id,
    });
    revalidatePath("/[locale]/admin", "layout");
    return { ok: true, message: decision };
  } catch (error) {
    return fail(error);
  }
}

export async function reviewVerificationDocumentAction(
  _prev: ReviewActionResult,
  formData: FormData,
): Promise<ReviewActionResult> {
  const { user } = await requirePermissionOrThrow("document.verify");
  const decision = String(formData.get("decision") ?? "") as "VERIFIED" | "REJECTED";
  const reason = String(formData.get("reason") ?? "").trim();
  if (decision === "REJECTED" && !reasonSchema.safeParse(reason).success)
    return { ok: false, message: "REASON_REQUIRED" };
  try {
    await reviewVerificationDocument({
      documentId: String(formData.get("documentId") ?? ""),
      decision,
      reason: reason || undefined,
      reviewerId: user.id,
    });
    revalidatePath("/[locale]/admin", "layout");
    return { ok: true, message: decision };
  } catch (error) {
    return fail(error);
  }
}

export async function decideVerificationCaseAction(
  _prev: ReviewActionResult,
  formData: FormData,
): Promise<ReviewActionResult> {
  const caseType = String(formData.get("caseType") ?? "");
  const approve = formData.get("decision") === "APPROVE";
  const reason = String(formData.get("reason") ?? "").trim();
  if (!approve && !reasonSchema.safeParse(reason).success)
    return { ok: false, message: "REASON_REQUIRED" };
  try {
    if (caseType === "CUSTOMER_IDENTITY") {
      const { user } = await requirePermissionOrThrow("customer.verify");
      await decideCustomerCase({
        caseId: String(formData.get("caseId") ?? ""),
        approve,
        reason: reason || undefined,
        actorId: user.id,
      });
    } else {
      const { user } = await requirePermissionOrThrow("owner.verify");
      await decideOwnerKyc({
        ownerProfileId: String(formData.get("ownerProfileId") ?? ""),
        approve,
        reason: reason || undefined,
        actorId: user.id,
      });
    }
    revalidatePath("/[locale]/admin", "layout");
    return { ok: true, message: approve ? "APPROVED" : "REJECTED" };
  } catch (error) {
    return fail(error);
  }
}

export async function createOverrideAction(
  _prev: ReviewActionResult,
  formData: FormData,
): Promise<ReviewActionResult> {
  const { user } = await requirePermissionOrThrow("document.override_block");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reasonSchema.safeParse(reason).success) return { ok: false, message: "REASON_REQUIRED" };
  const days = Number(formData.get("days") ?? 7);
  await createDocumentOverride({
    vehicleId: String(formData.get("vehicleId") ?? ""),
    reason,
    days: Number.isFinite(days) ? days : 7,
    actorId: user.id,
  });
  revalidatePath("/[locale]/admin/vehicles", "layout");
  return { ok: true, message: "OVERRIDE_CREATED" };
}

export async function revokeOverrideAction(formData: FormData): Promise<void> {
  const { user } = await requirePermissionOrThrow("document.override_block");
  await revokeDocumentOverride({
    overrideId: String(formData.get("overrideId") ?? ""),
    actorId: user.id,
    reason: String(formData.get("reason") ?? "revoked"),
  });
  revalidatePath("/[locale]/admin/vehicles", "layout");
}

const documentTypeSchema = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[a-z0-9_]{3,60}$/),
  subjectType: z.enum(["VEHICLE", "OWNER", "COMPANY", "CUSTOMER", "CHAUFFEUR", "CONTRACT"]),
  nameFr: z.string().trim().min(2).max(160),
  nameEn: z.string().trim().min(2).max(160),
  isMandatory: z.preprocess((v) => v === "on", z.boolean()),
  requiresExpiry: z.preprocess((v) => v === "on", z.boolean()),
  requiresNumber: z.preprocess((v) => v === "on", z.boolean()),
  blocksVehicleWhenExpired: z.preprocess((v) => v === "on", z.boolean()),
  isActive: z.preprocess((v) => v === "on", z.boolean()),
  alertDaysBefore: z
    .string()
    .trim()
    .regex(/^\d+(\s*,\s*\d+)*$/),
});

export async function saveDocumentTypeAction(
  _prev: ReviewActionResult,
  formData: FormData,
): Promise<ReviewActionResult> {
  const { user } = await requirePermissionOrThrow("document.configure_types");
  const parsed = documentTypeSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success)
    return {
      ok: false,
      message: "INVALID",
      details: parsed.error.issues.map((i) => i.path.join(".")),
    };
  const alertDaysBefore = [
    ...new Set(parsed.data.alertDaysBefore.split(",").map((s) => Number(s.trim()))),
  ].sort((a, b) => b - a);
  const data = { ...parsed.data, alertDaysBefore };
  const before = await db.documentType.findUnique({ where: { key: data.key } });
  await db.documentType.upsert({ where: { key: data.key }, update: data, create: data });
  await recordAudit({
    actorId: user.id,
    action: before ? "document_type.update" : "document_type.create",
    entityType: "DocumentType",
    entityId: data.key,
    before,
    after: data,
  });
  revalidatePath("/[locale]/admin/settings", "page");
  return { ok: true, message: "SAVED" };
}
