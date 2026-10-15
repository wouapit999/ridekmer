import { NextResponse, type NextRequest } from "next/server";

import { ingestPaymentWebhook } from "@/features/payments/service";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Provider callbacks: POST /api/webhooks/payments/{mtn-momo|orange-money|card}.
 * The raw body is passed untouched to the adapter for signature verification. Responses never
 * echo payloads: providers only need the status code.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ provider: string }> },
) {
  const { provider } = await context.params;
  const rawBody = await request.text();
  if (rawBody.length > 64 * 1024) {
    return NextResponse.json({ error: "payload too large" }, { status: 413 });
  }
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });
  try {
    const outcome = await ingestPaymentWebhook(provider, {
      headers,
      rawBody,
      receivedAt: new Date(),
    });
    return NextResponse.json({ result: outcome.result }, { status: outcome.httpStatus });
  } catch (error) {
    logger.error("payment.webhook.unhandled", { provider, error });
    return NextResponse.json({ result: "FAILED" }, { status: 500 });
  }
}

export function GET() {
  return NextResponse.json({ error: "method not allowed" }, { status: 405 });
}
