"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { recordAudit } from "@/server/audit";
import { requirePermissionOrThrow } from "@/server/auth/session";
import { db } from "@/server/db";

export interface AdminActionResult {
  ok: boolean;
  message?: string;
}

const rolesSchema = z.object({ userId: z.string().min(1), roleIds: z.array(z.string().min(1)) });

export async function saveUserRoles(
  _prev: AdminActionResult,
  formData: FormData,
): Promise<AdminActionResult> {
  const { user: actor } = await requirePermissionOrThrow("user.manage_roles");
  const parsed = rolesSchema.safeParse({
    userId: formData.get("userId"),
    roleIds: formData.getAll("roleIds").map(String),
  });
  if (!parsed.success) return { ok: false, message: "invalid" };
  if (parsed.data.userId === actor.id) return { ok: false, message: "self" };

  const before = await db.userRole.findMany({
    where: { userId: parsed.data.userId },
    select: { roleId: true },
  });
  const roles = await db.role.findMany({
    where: { id: { in: parsed.data.roleIds } },
    select: { id: true },
  });
  await db.$transaction([
    db.userRole.deleteMany({
      where: { userId: parsed.data.userId, roleId: { notIn: roles.map((r) => r.id) } },
    }),
    ...roles.map((r) =>
      db.userRole.upsert({
        where: { userId_roleId: { userId: parsed.data.userId, roleId: r.id } },
        update: {},
        create: { userId: parsed.data.userId, roleId: r.id, assignedBy: actor.id },
      }),
    ),
  ]);
  await recordAudit({
    actorId: actor.id,
    action: "user.roles.update",
    entityType: "User",
    entityId: parsed.data.userId,
    before: before.map((b) => b.roleId),
    after: roles.map((r) => r.id),
  });
  revalidatePath("/[locale]/admin/users/[id]", "page");
  return { ok: true, message: "saved" };
}

const statusSchema = z.object({
  userId: z.string().min(1),
  status: z.enum(["ACTIVE", "SUSPENDED"]),
  reason: z.string().trim().min(3).max(500),
});

export async function setUserStatus(
  _prev: AdminActionResult,
  formData: FormData,
): Promise<AdminActionResult> {
  const { user: actor } = await requirePermissionOrThrow("user.suspend");
  const parsed = statusSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, message: "invalid" };
  if (parsed.data.userId === actor.id) return { ok: false, message: "self" };

  const before = await db.user.findUnique({
    where: { id: parsed.data.userId },
    select: { status: true, suspensionReason: true },
  });
  const suspending = parsed.data.status === "SUSPENDED";
  await db.$transaction([
    db.user.update({
      where: { id: parsed.data.userId },
      data: {
        status: parsed.data.status,
        suspendedAt: suspending ? new Date() : null,
        suspensionReason: suspending ? parsed.data.reason : null,
      },
    }),
    ...(suspending ? [db.session.deleteMany({ where: { userId: parsed.data.userId } })] : []),
  ]);
  await recordAudit({
    actorId: actor.id,
    action: suspending ? "user.suspend" : "user.reinstate",
    entityType: "User",
    entityId: parsed.data.userId,
    before,
    after: { status: parsed.data.status },
    reason: parsed.data.reason,
  });
  revalidatePath("/[locale]/admin/users/[id]", "page");
  return { ok: true, message: suspending ? "suspended" : "reinstated" };
}

const citySchema = z.object({
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{2,40}$/),
  nameFr: z.string().trim().min(2).max(80),
  nameEn: z.string().trim().min(2).max(80),
  region: z.string().trim().max(80).optional().or(z.literal("")),
});

export async function addCity(
  _prev: AdminActionResult,
  formData: FormData,
): Promise<AdminActionResult> {
  const { user: actor } = await requirePermissionOrThrow("settings.manage");
  const parsed = citySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, message: "invalid" };
  const count = await db.city.count();
  const city = await db.city.create({
    data: { ...parsed.data, region: parsed.data.region || null, sortOrder: count + 1 },
  });
  await recordAudit({
    actorId: actor.id,
    action: "city.create",
    entityType: "City",
    entityId: city.id,
    after: parsed.data,
  });
  revalidatePath("/[locale]/admin/settings", "page");
  return { ok: true, message: "cityAdded" };
}

export async function toggleCity(formData: FormData): Promise<void> {
  const { user: actor } = await requirePermissionOrThrow("settings.manage");
  const id = String(formData.get("cityId") ?? "");
  const city = await db.city.findUniqueOrThrow({ where: { id } });
  await db.city.update({ where: { id }, data: { isActive: !city.isActive } });
  await recordAudit({
    actorId: actor.id,
    action: "city.toggle",
    entityType: "City",
    entityId: id,
    before: { isActive: city.isActive },
    after: { isActive: !city.isActive },
  });
  revalidatePath("/[locale]/admin/settings", "page");
}

const settingSchema = z.object({ key: z.string().min(1), value: z.string().max(2000) });

export async function updateSetting(
  _prev: AdminActionResult,
  formData: FormData,
): Promise<AdminActionResult> {
  const { user: actor } = await requirePermissionOrThrow("settings.manage");
  const parsed = settingSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, message: "invalid" };
  const existing = await db.systemSetting.findUnique({ where: { key: parsed.data.key } });
  if (!existing) return { ok: false, message: "invalid" };
  if (existing.valueType === "INTEGER" && !/^-?\d+$/.test(parsed.data.value))
    return { ok: false, message: "invalid" };
  if (existing.valueType === "BOOLEAN" && !["true", "false"].includes(parsed.data.value))
    return { ok: false, message: "invalid" };
  if (existing.valueType === "JSON") {
    try {
      JSON.parse(parsed.data.value);
    } catch {
      return { ok: false, message: "invalid" };
    }
  }
  await db.systemSetting.update({
    where: { key: parsed.data.key },
    data: { value: parsed.data.value, updatedById: actor.id },
  });
  await recordAudit({
    actorId: actor.id,
    action: "setting.update",
    entityType: "SystemSetting",
    entityId: parsed.data.key,
    before: { value: existing.value },
    after: { value: parsed.data.value },
  });
  revalidatePath("/[locale]/admin/settings", "page");
  return { ok: true, message: "settingSaved" };
}
