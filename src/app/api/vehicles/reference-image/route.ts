import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getCurrentSession } from "@/server/auth/session";
import { checkRateLimit } from "@/server/security/rate-limit";
import { findReferenceImage } from "@/server/vehicles/reference-image";

export const runtime = "nodejs";

const query = z.object({
  make: z.string().trim().min(2).max(60),
  model: z.string().trim().min(1).max(60),
});

/**
 * Preview of the illustrative photo shown to customers until the owner uploads real photos.
 * Signed-in users only (the vehicle form), rate limited; the upstream answers are cached.
 */
export async function GET(request: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const parsed = query.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "INVALID" }, { status: 400 });
  const limit = await checkRateLimit("vehicle.referenceImage", session.user.id);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "RATE_LIMITED" },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } },
    );
  }
  const image = await findReferenceImage(parsed.data.make, parsed.data.model);
  return NextResponse.json({ image }, { headers: { "cache-control": "private, max-age=3600" } });
}
