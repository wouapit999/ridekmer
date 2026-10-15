import { NextResponse, type NextRequest } from "next/server";

import { processDueDeletions } from "@/features/account/privacy";
import { logger } from "@/lib/logger";
import { assertCronRequest } from "@/server/cron/auth";
import { runHousekeeping } from "@/server/housekeeping";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Daily 02:30 UTC: retention purges, notification retries and due account anonymisations. */
export async function GET(request: NextRequest) {
  const denied = assertCronRequest(request);
  if (denied) return denied;
  try {
    const now = new Date();
    const housekeeping = await runHousekeeping(now);
    const deletions = await processDueDeletions(now);
    return NextResponse.json({ ok: true, ...housekeeping, deletions });
  } catch (error) {
    logger.error("cron.housekeeping.failed", { error });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
