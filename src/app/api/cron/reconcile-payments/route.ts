import { NextResponse, type NextRequest } from "next/server";

import { reconcilePayments } from "@/features/payments/service";
import { logger } from "@/lib/logger";
import { assertCronRequest } from "@/server/cron/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Every 15 minutes: expire stale payment requests, poll open ones, reconcile settled ones. */
export async function GET(request: NextRequest) {
  const denied = assertCronRequest(request);
  if (denied) return denied;
  try {
    const result = await reconcilePayments(new Date());
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    logger.error("cron.reconcile_payments.failed", { error });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
