"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { recordAudit } from "@/server/audit";
import { assignRole } from "@/server/auth/rbac";
import { getCurrentSession } from "@/server/auth/session";
import { db } from "@/server/db";

export interface ActionResult {
  ok: boolean;
  message?: string;
  errors?: Record<string, string>;
}

const profileSchema = z.object({
  name: z.string().trim().min(2).max(120),
  preferredLocale: z.enum(["fr", "en"]),
});

export async function updateProfile(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const current = await getCurrentSession();
  if (!current) return { ok: false, message: "unauthorized" };
  const parsed = profileSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      ok: false,
      errors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.code])),
    };
  }
  const before = await db.user.findUnique({
    where: { id: current.user.id },
    select: { name: true, preferredLocale: true },
  });
  await db.user.update({ where: { id: current.user.id }, data: parsed.data });
  await recordAudit({
    actorId: current.user.id,
    action: "user.profile.update",
    entityType: "User",
    entityId: current.user.id,
    before,
    after: parsed.data,
  });
  revalidatePath("/", "layout");
  return { ok: true, message: "saved" };
}

/** Grants the vehicle_owner role and creates a draft owner profile (idempotent). */
export async function activateOwnerSpace(): Promise<ActionResult> {
  const current = await getCurrentSession();
  if (!current) return { ok: false, message: "unauthorized" };
  const existing = await db.ownerProfile.findUnique({ where: { userId: current.user.id } });
  if (!existing) {
    await db.ownerProfile.create({
      data: { userId: current.user.id, ownerType: "INDIVIDUAL", displayName: current.user.name },
    });
  }
  await assignRole(current.user.id, "vehicle_owner", current.user.id);
  await recordAudit({
    actorId: current.user.id,
    action: "owner.space.activate",
    entityType: "OwnerProfile",
    entityId: current.user.id,
  });
  revalidatePath("/", "layout");
  return { ok: true };
}
