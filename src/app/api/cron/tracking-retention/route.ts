import { NextResponse, type NextRequest } from "next/server";

import { purgeLocationHistory } from "@/features/tracking/ingest";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { assertCronRequest } from "@/server/cron/auth";
import { db } from "@/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Daily 04:00 UTC: purge location history beyond the retention period (setting > env). */
export async function GET(request: NextRequest) {
  const denied = assertCronRequest(request);
  if (denied) return denied;
  try {
    const setting = await db.systemSetting.findUnique({
      where: { key: "tracking.location_retention_days" },
    });
    const days =
      Number(setting?.value) > 0 ? Number(setting!.value) : getEnv().GPS_LOCATION_RETENTION_DAYS;
    const result = await purgeLocationHistory(days, new Date());
    return NextResponse.json({ ok: true, retentionDays: days, ...result });
  } catch (error) {
    logger.error("cron.tracking_retention.failed", { error });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
