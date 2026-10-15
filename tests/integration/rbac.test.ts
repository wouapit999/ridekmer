import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/server/db";
import {
  assertPermission,
  assignRole,
  getAccessProfile,
  hasPermission,
  removeRole,
  ForbiddenError,
} from "@/server/auth/rbac";

const email = `rbac-${randomUUID()}@ridekmer.test`;
let userId: string;

beforeAll(async () => {
  const user = await db.user.create({ data: { email, name: "RBAC Test", emailVerified: true } });
  userId = user.id;
});

afterAll(async () => {
  await db.user.delete({ where: { id: userId } });
  await db.$disconnect();
});

describe("roles and permissions (database)", () => {
  it("grants nothing to a user without roles", async () => {
    const profile = await getAccessProfile(userId);
    expect(profile.permissions.size).toBe(0);
    expect(profile.isStaff).toBe(false);
    await expect(assertPermission(userId, "vehicle.approve")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("derives permissions from assigned roles and requires MFA for staff roles", async () => {
    await assignRole(userId, "fleet_manager", "test");
    expect(await hasPermission(userId, "vehicle.approve")).toBe(true);
    expect(await hasPermission(userId, "payout.process")).toBe(false);
    const profile = await getAccessProfile(userId);
    expect(profile.isStaff).toBe(true);
    expect(profile.requiresMfa).toBe(true);
  });

  it("gives super administrators every permission", async () => {
    await removeRole(userId, "fleet_manager");
    await assignRole(userId, "super_administrator", "test");
    const profile = await getAccessProfile(userId);
    expect(profile.isSuperAdmin).toBe(true);
    expect(await hasPermission(userId, "payout.process")).toBe(true);
    expect(await hasPermission(userId, "tracking.view_history")).toBe(true);
  });

  it("ignores expired role assignments", async () => {
    await removeRole(userId, "super_administrator");
    const role = await db.role.findUniqueOrThrow({ where: { key: "finance_officer" } });
    await db.userRole.create({
      data: { userId, roleId: role.id, expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await hasPermission(userId, "refund.approve")).toBe(false);
  });
});
