import { cache } from "react";

import { db } from "@/server/db";

import { ALL_PERMISSION_KEYS, SUPER_ADMIN_ROLE, type PermissionKey } from "./permissions";

export class ForbiddenError extends Error {
  readonly status = 403;
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class UnauthorizedError extends Error {
  readonly status = 401;
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export interface AccessProfile {
  userId: string;
  roles: Array<{ key: string; isStaff: boolean; requiresMfa: boolean }>;
  permissions: Set<PermissionKey>;
  isStaff: boolean;
  requiresMfa: boolean;
  isSuperAdmin: boolean;
}

/** Load roles and effective permissions for a user (request-scoped cache). */
export const getAccessProfile = cache(async (userId: string): Promise<AccessProfile> => {
  const now = new Date();
  const userRoles = await db.userRole.findMany({
    where: { userId, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    include: { role: { include: { rolePermissions: { include: { permission: true } } } } },
  });
  const roles = userRoles.map((ur) => ({
    key: ur.role.key,
    isStaff: ur.role.isStaff,
    requiresMfa: ur.role.requiresMfa,
  }));
  const isSuperAdmin = roles.some((r) => r.key === SUPER_ADMIN_ROLE);
  const permissions = new Set<PermissionKey>(
    isSuperAdmin
      ? ALL_PERMISSION_KEYS
      : userRoles.flatMap((ur) =>
          ur.role.rolePermissions.map((rp) => rp.permission.key as PermissionKey),
        ),
  );
  return {
    userId,
    roles,
    permissions,
    isStaff: roles.some((r) => r.isStaff),
    requiresMfa: roles.some((r) => r.requiresMfa),
    isSuperAdmin,
  };
});

export async function hasPermission(userId: string, permission: PermissionKey): Promise<boolean> {
  const profile = await getAccessProfile(userId);
  return profile.permissions.has(permission);
}

export async function hasAnyPermission(
  userId: string,
  permissions: PermissionKey[],
): Promise<boolean> {
  const profile = await getAccessProfile(userId);
  return permissions.some((p) => profile.permissions.has(p));
}

/** Throws ForbiddenError; use inside server actions, route handlers and services. */
export async function assertPermission(
  userId: string,
  permission: PermissionKey,
): Promise<AccessProfile> {
  const profile = await getAccessProfile(userId);
  if (!profile.permissions.has(permission)) {
    throw new ForbiddenError(`Missing permission ${permission}`);
  }
  return profile;
}

export async function assignDefaultRole(userId: string): Promise<void> {
  const role = await db.role.findUnique({ where: { key: "customer" } });
  if (!role) return; // reference data not seeded yet
  await db.userRole.upsert({
    where: { userId_roleId: { userId, roleId: role.id } },
    update: {},
    create: { userId, roleId: role.id, assignedBy: "system" },
  });
}

export async function assignRole(
  userId: string,
  roleKey: string,
  assignedBy: string,
): Promise<void> {
  const role = await db.role.findUniqueOrThrow({ where: { key: roleKey } });
  await db.userRole.upsert({
    where: { userId_roleId: { userId, roleId: role.id } },
    update: { assignedBy },
    create: { userId, roleId: role.id, assignedBy },
  });
}

export async function removeRole(userId: string, roleKey: string): Promise<void> {
  const role = await db.role.findUniqueOrThrow({ where: { key: roleKey } });
  await db.userRole.deleteMany({ where: { userId, roleId: role.id } });
}
