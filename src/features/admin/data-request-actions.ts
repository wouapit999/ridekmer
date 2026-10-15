"use server";

import { revalidatePath } from "next/cache";

import { anonymiseUser, PrivacyError } from "@/features/account/privacy";
import { recordAudit } from "@/server/audit";
import { requirePermissionOrThrow } from "@/server/auth/session";
import { db } from "@/server/db";

export interface DataRequestActionResult {
  ok: boolean;
  code?: string;
}

/** Administrator processes a deletion request before the grace period ends. */
export async function anonymiseNowAction(requestId: string): Promise<DataRequestActionResult> {
  const { user } = await requirePermissionOrThrow("user.suspend");
  const request = await db.dataRequest.findUnique({ where: { id: requestId } });
  if (!request || request.type !== "DELETION") return { ok: false, code: "NOT_FOUND" };
  try {
    await anonymiseUser(request.userId, user.id);
  } catch (error) {
    if (error instanceof PrivacyError) return { ok: false, code: error.code };
    throw error;
  }
  revalidatePath("/[locale]/admin/data-requests", "page");
  return { ok: true };
}

export async function rejectDataRequestAction(
  requestId: string,
  reason: string,
): Promise<DataRequestActionResult> {
  const { user } = await requirePermissionOrThrow("user.suspend");
  const request = await db.dataRequest.findUnique({ where: { id: requestId } });
  if (!request || request.status === "COMPLETED") return { ok: false, code: "NOT_FOUND" };
  await db.$transaction([
    db.dataRequest.update({
      where: { id: requestId },
      data: { status: "REJECTED", processedAt: new Date(), processedBy: user.id, reason },
    }),
    db.user.updateMany({
      where: { id: request.userId, status: "PENDING_DELETION" },
      data: { status: "ACTIVE" },
    }),
  ]);
  await recordAudit({
    actorId: user.id,
    action: "privacy.request.rejected",
    entityType: "DataRequest",
    entityId: requestId,
    reason,
  });
  revalidatePath("/[locale]/admin/data-requests", "page");
  return { ok: true };
}
