import { randomUUID } from "node:crypto";

import { verifyPassword } from "better-auth/crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { bootstrapSuperAdmin, generateTemporaryPassword } from "@/server/auth/bootstrap-admin";
import { SUPER_ADMIN_ROLE } from "@/server/auth/permissions";
import { getAccessProfile } from "@/server/auth/rbac";
import { db } from "@/server/db";

const suffix = randomUUID().slice(0, 8);
const newAdminEmail = `bootstrap-${suffix}@ridekmer.test`;
const existingEmail = `bootstrap-existing-${suffix}@ridekmer.test`;
const createdUserIds: string[] = [];

// Integration files run sequentially (fileParallelism: false); other files remove the roles
// they grant, so no super administrator should exist when this file starts. Guard anyway.
async function clearSuperAdmins() {
  await db.userRole.deleteMany({ where: { role: { key: SUPER_ADMIN_ROLE } } });
}

beforeAll(async () => {
  await clearSuperAdmins();
});

afterAll(async () => {
  await db.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await db.$disconnect();
});

describe("first super administrator bootstrap", () => {
  it("generates readable temporary passwords of the requested length", () => {
    const password = generateTemporaryPassword();
    expect(password).toHaveLength(20);
    expect(password).toMatch(/^[A-HJ-NP-Za-km-z2-9]+$/);
    expect(generateTemporaryPassword()).not.toBe(password);
  });

  it("creates the account, the credential and the role, and returns the password when no mailer is configured", async () => {
    const result = await bootstrapSuperAdmin({
      email: newAdminEmail,
      name: "Ops Lead",
      locale: "en",
    });
    expect(result.outcome).toBe("created");
    if (result.outcome !== "created") return;
    createdUserIds.push(result.userId);
    expect(result.delivery).toBe("log");
    expect(result.temporaryPassword).toHaveLength(20);

    const user = await db.user.findUniqueOrThrow({
      where: { email: newAdminEmail },
      include: { accounts: true },
    });
    expect(user.emailVerified).toBe(true);
    expect(user.preferredLocale).toBe("en");
    const credential = user.accounts.find((a) => a.providerId === "credential");
    expect(credential?.password).toBeTruthy();
    expect(credential?.password).not.toContain(result.temporaryPassword!);
    expect(
      await verifyPassword({ hash: credential!.password!, password: result.temporaryPassword! }),
    ).toBe(true);

    const profile = await getAccessProfile(user.id);
    expect(profile.isSuperAdmin).toBe(true);
    expect(profile.requiresMfa).toBe(true);

    const notification = await db.notification.findFirst({
      where: { userId: user.id, templateKey: "admin_credentials" },
    });
    expect(notification?.body).toBe("[sensitive content not stored]");
    const audit = await db.auditLog.findFirst({
      where: { entityId: user.id, action: "user.bootstrap_admin_created" },
    });
    expect(audit).not.toBeNull();
  });

  it("refuses once a super administrator exists", async () => {
    const result = await bootstrapSuperAdmin({ email: `other-${suffix}@ridekmer.test` });
    expect(result).toEqual({ outcome: "already_configured", email: newAdminEmail });
    expect(
      await db.user.findUnique({ where: { email: `other-${suffix}@ridekmer.test` } }),
    ).toBeNull();
  });

  it("grants the role to an existing account instead of creating a second one", async () => {
    await clearSuperAdmins();
    const existing = await db.user.create({
      data: { email: existingEmail, name: "Already Here", emailVerified: false },
    });
    createdUserIds.push(existing.id);

    const result = await bootstrapSuperAdmin({ email: existingEmail.toUpperCase() });
    expect(result).toMatchObject({
      outcome: "role_granted",
      userId: existing.id,
      email: existingEmail,
    });
    expect((await db.user.findUniqueOrThrow({ where: { id: existing.id } })).emailVerified).toBe(
      true,
    );
    expect((await getAccessProfile(existing.id)).isSuperAdmin).toBe(true);
    const notice = await db.notification.findFirst({
      where: { userId: existing.id, templateKey: "admin_role_granted" },
    });
    expect(notice?.recipient).toBe(existingEmail);
  });
});
