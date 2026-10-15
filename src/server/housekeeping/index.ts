import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/server/audit";
import { db } from "@/server/db";
import { sendTemplatedNotification } from "@/server/notifications";

/**
 * Daily housekeeping (ADR-032): deletes operational rows that have outlived their purpose so
 * the database holds only what retention policy allows. Everything here is idempotent and
 * bounded; financial, audit, contract and inspection rows are never touched.
 */
export interface HousekeepingPolicy {
  notificationRetentionDays: number;
  webhookEventRetentionDays: number;
  holdRetentionDays: number;
}

export const DEFAULT_HOUSEKEEPING_POLICY: HousekeepingPolicy = {
  notificationRetentionDays: 180,
  webhookEventRetentionDays: 365,
  holdRetentionDays: 30,
};

export interface HousekeepingResult {
  sessions: number;
  verifications: number;
  idempotencyKeys: number;
  rateLimits: number;
  holds: number;
  webhookEvents: number;
  notifications: number;
  notificationRetries: { retried: number; failed: number };
}

function daysAgo(days: number, now: Date): Date {
  return new Date(now.getTime() - days * 86_400_000);
}

/** Pure: resolve retention days from settings rows with defaults; exported for tests. */
export function resolvePolicy(
  settings: Array<{ key: string; value: string }>,
  defaults: HousekeepingPolicy = DEFAULT_HOUSEKEEPING_POLICY,
): HousekeepingPolicy {
  const read = (key: string, fallback: number) => {
    const raw = settings.find((s) => s.key === key)?.value;
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : fallback;
  };
  return {
    notificationRetentionDays: read(
      "privacy.notification_retention_days",
      defaults.notificationRetentionDays,
    ),
    webhookEventRetentionDays: read(
      "privacy.webhook_event_retention_days",
      defaults.webhookEventRetentionDays,
    ),
    holdRetentionDays: read("privacy.hold_retention_days", defaults.holdRetentionDays),
  };
}

export async function loadHousekeepingPolicy(): Promise<HousekeepingPolicy> {
  const settings = await db.systemSetting.findMany({
    where: { key: { startsWith: "privacy." } },
    select: { key: true, value: true },
  });
  return resolvePolicy(settings);
}

export async function runHousekeeping(
  now = new Date(),
  policy?: HousekeepingPolicy,
): Promise<HousekeepingResult> {
  const p = policy ?? (await loadHousekeepingPolicy());
  const sessions = await db.session.deleteMany({ where: { expiresAt: { lt: now } } });
  const verifications = await db.verification.deleteMany({ where: { expiresAt: { lt: now } } });
  const idempotencyKeys = await db.idempotencyKey.deleteMany({
    where: { expiresAt: { lt: now } },
  });
  // Better Auth's database limiter keeps one row per key; rows idle for a day are garbage.
  const rateLimits = await db.rateLimit.deleteMany({
    where: { lastRequest: { lt: BigInt(now.getTime() - 86_400_000) } },
  });
  const holds = await db.reservationHold.deleteMany({
    where: {
      status: { in: ["EXPIRED", "RELEASED"] },
      updatedAt: { lt: daysAgo(p.holdRetentionDays, now) },
    },
  });
  const webhookEvents = await db.paymentWebhookEvent.deleteMany({
    where: {
      status: { in: ["PROCESSED", "IGNORED", "REPLAY_REJECTED"] },
      receivedAt: { lt: daysAgo(p.webhookEventRetentionDays, now) },
    },
  });
  const notifications = await db.notification.deleteMany({
    where: {
      status: { in: ["SENT", "DELIVERED", "READ", "FAILED"] },
      createdAt: { lt: daysAgo(p.notificationRetentionDays, now) },
    },
  });
  const notificationRetries = await retryFailedNotifications(now);

  const result: HousekeepingResult = {
    sessions: sessions.count,
    verifications: verifications.count,
    idempotencyKeys: idempotencyKeys.count,
    rateLimits: rateLimits.count,
    holds: holds.count,
    webhookEvents: webhookEvents.count,
    notifications: notifications.count,
    notificationRetries,
  };
  await recordAudit({
    actorType: "CRON",
    action: "cron.housekeeping",
    entityType: "System",
    after: result,
  });
  logger.info("housekeeping.completed", { ...result });
  return result;
}

export const MAX_NOTIFICATION_ATTEMPTS = 3;

/**
 * Re-send SMS / email notifications that failed at the provider in the last 24 hours, at most
 * three attempts per notification. In-app rows cannot fail; OTP-style sensitive bodies are not
 * stored and therefore never retried.
 */
export async function retryFailedNotifications(now = new Date()) {
  const env = getEnv();
  const candidates = await db.notification.findMany({
    where: {
      status: "FAILED",
      channel: { in: ["SMS", "EMAIL", "WHATSAPP"] },
      attempts: { lt: MAX_NOTIFICATION_ATTEMPTS },
      createdAt: { gte: daysAgo(1, now) },
      recipient: { not: null },
      NOT: { body: { startsWith: "[sensitive" } },
    },
    take: 100,
    orderBy: { createdAt: "asc" },
  });
  let retried = 0;
  let failed = 0;
  for (const n of candidates) {
    // Mark the attempt first so a crash mid-send cannot loop forever.
    await db.notification.update({ where: { id: n.id }, data: { attempts: { increment: 1 } } });
    try {
      const result = await sendTemplatedNotification({
        templateKey: n.templateKey,
        channel: n.channel as "SMS" | "EMAIL" | "WHATSAPP",
        locale: n.locale === "en" ? "en" : "fr",
        to: n.recipient!,
        userId: n.userId,
        variables: {},
        entityType: n.entityType ?? undefined,
        entityId: n.entityId ?? undefined,
        prerendered: { subject: n.subject ?? undefined, body: n.body },
        persist: false,
      });
      if (result.ok) {
        retried += 1;
        await db.notification.update({
          where: { id: n.id },
          data: { status: "SENT", sentAt: now, error: null, provider: result.provider },
        });
      } else {
        failed += 1;
        await db.notification.update({ where: { id: n.id }, data: { error: result.error } });
      }
    } catch (error) {
      failed += 1;
      logger.warn("housekeeping.notification_retry_failed", { id: n.id, error });
    }
  }
  if (env.EMAIL_PROVIDER === "log" && env.SMS_PROVIDER === "log" && candidates.length) {
    logger.info("housekeeping.notification_retry_log_providers", { count: candidates.length });
  }
  return { retried, failed };
}
