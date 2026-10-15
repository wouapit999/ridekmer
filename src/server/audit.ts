import { headers } from "next/headers";

import { logger } from "@/lib/logger";
import { db } from "@/server/db";

import type { ActorType } from "@/generated/prisma/enums";

export interface AuditInput {
  actorId?: string | null;
  actorType?: ActorType;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  requestId?: string | null;
}

async function requestContext(): Promise<{ ipAddress?: string; userAgent?: string }> {
  try {
    const h = await headers();
    const forwarded = h.get("x-forwarded-for");
    return {
      ipAddress: forwarded?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? undefined,
      userAgent: h.get("user-agent") ?? undefined,
    };
  } catch {
    return {}; // outside a request scope (cron, seed, tests)
  }
}

function toJson(value: unknown) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

/** Append an audit-log row. Never throws: an audit failure is logged, not propagated. */
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    const ctx = await requestContext();
    await db.auditLog.create({
      data: {
        actorId: input.actorId ?? undefined,
        actorType: input.actorType ?? (input.actorId ? "USER" : "SYSTEM"),
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? undefined,
        before: toJson(input.before),
        after: toJson(input.after),
        reason: input.reason ?? undefined,
        requestId: input.requestId ?? undefined,
        ...ctx,
      },
    });
  } catch (error) {
    logger.error("audit.write_failed", {
      action: input.action,
      entityType: input.entityType,
      error,
    });
  }
}
