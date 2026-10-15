import { NextResponse, type NextRequest } from "next/server";

import { processDocumentExpiry } from "@/features/documents/service";
import { logger } from "@/lib/logger";
import { assertCronRequest } from "@/server/cron/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Daily: document expiry alerts (60/30/14/7/0 days), expiry marking, vehicle availability. */
export async function GET(request: NextRequest) {
  const denied = assertCronRequest(request);
  if (denied) return denied;
  try {
    const result = await processDocumentExpiry(new Date());
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    logger.error("cron.document_expiry.failed", { error });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
