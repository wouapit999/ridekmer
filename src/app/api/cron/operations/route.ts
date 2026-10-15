import { NextResponse, type NextRequest } from "next/server";

import { sendBookingReminders } from "@/features/bookings/reminders";
import { sendMaintenanceReminders } from "@/features/maintenance/service";
import { logger } from "@/lib/logger";
import { assertCronRequest } from "@/server/cron/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Hourly: pickup/return reminders, late-return detection, maintenance reminders. */
export async function GET(request: NextRequest) {
  const denied = assertCronRequest(request);
  if (denied) return denied;
  try {
    const now = new Date();
    const bookings = await sendBookingReminders(now);
    const maintenance = await sendMaintenanceReminders(now);
    return NextResponse.json({ ok: true, bookings, maintenance });
  } catch (error) {
    logger.error("cron.operations.failed", { error });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
