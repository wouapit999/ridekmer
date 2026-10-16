import { randomInt } from "node:crypto";

import { hashPassword } from "better-auth/crypto";

import { getEnv } from "@/lib/env";
import { logger, maskEmail } from "@/lib/logger";
import { recordAudit } from "@/server/audit";
import { db } from "@/server/db";
import { emailDeliveryConfigured, sendTemplatedNotification } from "@/server/notifications";

import { seedReferenceData } from "../../../prisma/seed-data/reference";
import { ROLE_DEFINITIONS, SUPER_ADMIN_ROLE } from "./permissions";
import { assignRole } from "./rbac";

export interface BootstrapAdminInput {
  email: string;
  name?: string;
  locale?: "fr" | "en";
  /** Re-apply the reference data even when the roles already exist (slow on serverless). */
  reseed?: boolean;
}

export type BootstrapAdminResult =
  | {
      outcome: "created";
      userId: string;
      email: string;
      /** Provider that carried the credentials ("log" means nothing was sent). */
      delivery: string;
      /** Only present when no real e-mail provider is configured: the caller must hand it over. */
      temporaryPassword?: string;
    }
  | { outcome: "role_granted"; userId: string; email: string; delivery: string }
  | { outcome: "already_configured"; email: string };

export class BootstrapRefusedError extends Error {
  readonly status = 409;
  constructor(message: string) {
    super(message);
    this.name = "BootstrapRefusedError";
  }
}

// Readable alphabet: no 0/O, 1/l/I so the password survives being read from an e-mail.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
const PASSWORD_LENGTH = 20;

export function generateTemporaryPassword(length = PASSWORD_LENGTH): string {
  let out = "";
  for (let i = 0; i < length; i += 1) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

async function activeSuperAdmin() {
  return db.userRole.findFirst({
    where: {
      role: { key: SUPER_ADMIN_ROLE },
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      user: { deletedAt: null },
    },
    include: { user: { select: { email: true } } },
  });
}

/**
 * One-time creation of the first super administrator (docs/OPERATIONS_RUNBOOK.md).
 *
 * - Reference data (roles, permissions, settings, templates) is (re)applied first, so the
 *   call works on a freshly migrated database without a local `pnpm db:seed`.
 * - Refuses once a super administrator exists: this is a bootstrap, not a back door.
 *   Further administrators are granted from Administration → Users (audited, dual control).
 * - An existing account with that e-mail receives the role and a notice; a new account
 *   receives a temporary password by e-mail. The password is never stored in clear and
 *   never logged; without a real e-mail provider it is returned to the caller once.
 * - The account must still enable TOTP before the administration area opens
 *   (`AUTH_REQUIRE_STAFF_MFA`).
 */
export async function bootstrapSuperAdmin(
  input: BootstrapAdminInput,
): Promise<BootstrapAdminResult> {
  const email = input.email.trim().toLowerCase();
  const locale = input.locale ?? "fr";
  const env = getEnv();
  const loginUrl = `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/${locale}/login`;

  // The reference data takes a minute of sequential upserts; a serverless function only
  // applies it when the roles are missing (fresh database) or when explicitly asked.
  const roleCount = await db.role.count();
  if (input.reseed || roleCount < ROLE_DEFINITIONS.length) {
    await seedReferenceData(db, (msg) => logger.info("bootstrap.reference_data", { msg }));
  } else {
    logger.info("bootstrap.reference_data_present", { roles: roleCount });
  }

  const existingAdmin = await activeSuperAdmin();
  if (existingAdmin) {
    logger.warn("bootstrap.refused_admin_exists", {
      requested: maskEmail(email),
      existing: maskEmail(existingAdmin.user.email),
    });
    return { outcome: "already_configured", email: existingAdmin.user.email };
  }

  const existingUser = await db.user.findUnique({ where: { email } });
  if (existingUser) {
    if (existingUser.deletedAt || existingUser.status !== "ACTIVE") {
      throw new BootstrapRefusedError("The account with that e-mail is suspended or deleted.");
    }
    await assignRole(existingUser.id, SUPER_ADMIN_ROLE, "bootstrap");
    await db.user.update({ where: { id: existingUser.id }, data: { emailVerified: true } });
    await recordAudit({
      actorType: "SYSTEM",
      action: "user.role_granted",
      entityType: "User",
      entityId: existingUser.id,
      after: { role: SUPER_ADMIN_ROLE, via: "bootstrap" },
    });
    const delivery = await sendTemplatedNotification({
      templateKey: "admin_role_granted",
      channel: "EMAIL",
      locale,
      to: email,
      userId: existingUser.id,
      variables: { name: existingUser.name, email, url: loginUrl },
      entityType: "User",
      entityId: existingUser.id,
    });
    logger.info("bootstrap.role_granted", { userId: existingUser.id, email: maskEmail(email) });
    return {
      outcome: "role_granted",
      userId: existingUser.id,
      email,
      delivery: delivery.provider,
    };
  }

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  const name = input.name?.trim() || "Administrator";
  const user = await db.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: { email, name, emailVerified: true, preferredLocale: locale, status: "ACTIVE" },
    });
    await tx.account.create({
      data: {
        userId: created.id,
        providerId: "credential",
        accountId: created.id,
        password: passwordHash,
      },
    });
    return created;
  });
  await assignRole(user.id, SUPER_ADMIN_ROLE, "bootstrap");
  await recordAudit({
    actorType: "SYSTEM",
    action: "user.bootstrap_admin_created",
    entityType: "User",
    entityId: user.id,
    after: { role: SUPER_ADMIN_ROLE },
  });

  const delivery = await sendTemplatedNotification({
    templateKey: "admin_credentials",
    channel: "EMAIL",
    locale,
    to: email,
    userId: user.id,
    variables: { name, email, password: temporaryPassword, url: loginUrl },
    entityType: "User",
    entityId: user.id,
    sensitive: true,
  });
  logger.info("bootstrap.admin_created", {
    userId: user.id,
    email: maskEmail(email),
    delivery: delivery.provider,
    delivered: delivery.ok,
  });
  const delivered = delivery.ok && emailDeliveryConfigured();
  return {
    outcome: "created",
    userId: user.id,
    email,
    delivery: delivery.ok ? delivery.provider : `${delivery.provider}:failed`,
    ...(delivered ? {} : { temporaryPassword }),
  };
}
