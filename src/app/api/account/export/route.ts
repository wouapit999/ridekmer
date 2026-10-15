import { NextResponse } from "next/server";

import { buildDataExport, requestDataExport } from "@/features/account/privacy";
import { logger } from "@/lib/logger";
import { getCurrentSession } from "@/server/auth/session";
import { enforceRateLimit, RateLimitedError } from "@/server/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Self-service personal-data export (JSON). Authenticated, rate limited, audited. */
export async function GET() {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    await enforceRateLimit("privacy.export", current.user.id);
    const data = await buildDataExport(current.user.id);
    await requestDataExport(current.user.id);
    const fileName = `ridekmer-export-${new Date().toISOString().slice(0, 10)}.json`;
    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${fileName}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof RateLimitedError) {
      return NextResponse.json(
        { error: "rate_limited", retryAfterSeconds: error.retryAfterSeconds },
        { status: 429, headers: { "retry-after": String(error.retryAfterSeconds) } },
      );
    }
    logger.error("privacy.export.failed", { error });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
