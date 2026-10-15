import { NextResponse, type NextRequest } from "next/server";

import { expireHoldsAndUnpaidBookings } from "@/features/bookings/service";
import { logger } from "@/lib/logger";
import { assertCronRequest } from "@/server/cron/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Every 5 minutes: release expired checkout holds and cancel bookings whose payment deadline passed. */
export async function GET(request: NextRequest) {
  const denied = assertCronRequest(request);
  if (denied) return denied;
  try {
    const result = await expireHoldsAndUnpaidBookings(new Date());
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    logger.error("cron.expire_holds.failed", { error });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
