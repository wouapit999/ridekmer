import { NextResponse, type NextRequest } from "next/server";

import { ingestTrackingWebhook } from "@/features/tracking/ingest";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Telematics push endpoint: POST /api/webhooks/gps/generic (HMAC-SHA256 over the raw body). */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ provider: string }> },
) {
  const { provider } = await context.params;
  const rawBody = await request.text();
  if (rawBody.length > 512 * 1024)
    return NextResponse.json({ error: "payload too large" }, { status: 413 });
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });
  try {
    const outcome = await ingestTrackingWebhook(provider, { headers, rawBody });
    return NextResponse.json(
      { result: outcome.result, ...("ingest" in outcome ? { ingest: outcome.ingest } : {}) },
      { status: outcome.httpStatus },
    );
  } catch (error) {
    logger.error("tracking.webhook.unhandled", { provider, error });
    return NextResponse.json({ result: "FAILED" }, { status: 500 });
  }
}

export function GET() {
  return NextResponse.json({ error: "method not allowed" }, { status: 405 });
}
