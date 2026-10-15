import { NextResponse, type NextRequest } from "next/server";

import { safeEqual } from "@/lib/crypto";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { db } from "@/server/db";
import { getStorageProvider } from "@/server/files/storage";
import { listAvailableMethods } from "@/server/payments/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CheckState = "ok" | "degraded" | "failed" | "skipped";

interface Check {
  state: CheckState;
  latencyMs?: number;
  detail?: string;
}

/**
 * Health endpoint.
 *
 * - Anonymous: liveness + database connectivity (`status`, `database`, `latencyMs`) — enough for
 *   uptime monitors without revealing configuration.
 * - With `Authorization: Bearer $CRON_SECRET` (or `?deep=1` with the same header): readiness
 *   details — pending migrations, storage provider reachability, payment provider modes,
 *   cron freshness. Never returns secrets or hostnames.
 */
export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const checks: Record<string, Check> = {};

  try {
    await db.$queryRaw`SELECT 1`;
    checks.database = { state: "ok", latencyMs: Date.now() - startedAt };
  } catch {
    checks.database = { state: "failed", detail: "unreachable" };
    return NextResponse.json(
      { status: "degraded", database: "unreachable", latencyMs: Date.now() - startedAt },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  const authorised = isAuthorised(request);
  if (!authorised) {
    return NextResponse.json(
      { status: "ok", database: "ok", latencyMs: checks.database.latencyMs },
      { headers: { "cache-control": "no-store" } },
    );
  }

  checks.migrations = await migrationsCheck();
  checks.storage = await storageCheck();
  checks.payments = await paymentsCheck();
  checks.cron = await cronCheck();
  checks.environment = environmentCheck();

  const states = Object.values(checks).map((c) => c.state);
  const status = states.includes("failed")
    ? "failed"
    : states.includes("degraded")
      ? "degraded"
      : "ok";
  return NextResponse.json(
    {
      status,
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
      appEnv: getEnv().APP_ENV,
      checks,
      latencyMs: Date.now() - startedAt,
    },
    { status: status === "failed" ? 503 : 200, headers: { "cache-control": "no-store" } },
  );
}

function isAuthorised(request: NextRequest): boolean {
  const header = request.headers.get("authorization") ?? "";
  return safeEqual(header, `Bearer ${getEnv().CRON_SECRET}`);
}

async function migrationsCheck(): Promise<Check> {
  try {
    const rows = await db.$queryRaw<Array<{ pending: bigint; latest: string | null }>>`
      SELECT
        COUNT(*) FILTER (WHERE finished_at IS NULL AND rolled_back_at IS NULL) AS pending,
        MAX(migration_name) FILTER (WHERE finished_at IS NOT NULL) AS latest
      FROM "_prisma_migrations"`;
    const pending = Number(rows[0]?.pending ?? 0);
    return {
      state: pending > 0 ? "failed" : "ok",
      detail: pending > 0 ? `${pending} unfinished migration(s)` : (rows[0]?.latest ?? undefined),
    };
  } catch {
    return { state: "failed", detail: "migration table missing" };
  }
}

async function storageCheck(): Promise<Check> {
  const env = getEnv();
  const startedAt = Date.now();
  try {
    const provider = getStorageProvider();
    // A HEAD-style probe on a key that does not exist: proves credentials and reachability
    // without creating objects. Providers return null for a missing object.
    await provider.exists("health/probe-does-not-exist");
    return {
      state: env.STORAGE_PROVIDER === "local" && env.APP_ENV === "production" ? "failed" : "ok",
      latencyMs: Date.now() - startedAt,
      detail: env.STORAGE_PROVIDER,
    };
  } catch (error) {
    logger.warn("health.storage_probe_failed", { error });
    return { state: "failed", latencyMs: Date.now() - startedAt, detail: env.STORAGE_PROVIDER };
  }
}

async function paymentsCheck(): Promise<Check> {
  try {
    const methods = await listAvailableMethods();
    const anyReal = methods.some((m) => m.environment !== "mock");
    return {
      state: getEnv().APP_ENV === "production" && !anyReal ? "degraded" : "ok",
      detail: methods.map((m) => `${m.method}:${m.environment}`).join(","),
    };
  } catch (error) {
    logger.warn("health.payments_check_failed", { error });
    return { state: "degraded", detail: "provider resolution failed" };
  }
}

/** Cron freshness: the hold-expiry job runs every five minutes and leaves an audit trail. */
async function cronCheck(): Promise<Check> {
  try {
    const last = await db.auditLog.findFirst({
      where: { actorType: { in: ["SYSTEM", "CRON"] }, action: { startsWith: "cron." } },
      orderBy: { createdAt: "desc" },
      select: { action: true, createdAt: true },
    });
    if (!last) return { state: "degraded", detail: "no cron run recorded yet" };
    const ageMinutes = Math.round((Date.now() - last.createdAt.getTime()) / 60_000);
    return {
      state: ageMinutes > 26 * 60 ? "degraded" : "ok",
      detail: `${last.action} ${ageMinutes} min ago`,
    };
  } catch {
    return { state: "skipped" };
  }
}

function environmentCheck(): Check {
  const env = getEnv();
  const warnings: string[] = [];
  if (env.APP_ENV === "production") {
    if (env.EMAIL_PROVIDER === "log") warnings.push("email:log");
    if (env.SMS_PROVIDER === "log") warnings.push("sms:log");
    if (env.GPS_PROVIDER === "mock") warnings.push("gps:mock");
    if (env.MONITORING_PROVIDER === "none") warnings.push("monitoring:none");
  }
  return { state: warnings.length ? "degraded" : "ok", detail: warnings.join(",") || undefined };
}
