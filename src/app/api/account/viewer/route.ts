import { NextResponse } from "next/server";

import { getAccessProfile } from "@/server/auth/rbac";
import { getCurrentSession } from "@/server/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Minimal viewer descriptor for the client-rendered site header (ADR-033). Lets the public
 * marketing pages be statically rendered while the header still shows the signed-in state.
 * Returns only what the header needs; never cached by shared caches.
 */
export async function GET() {
  const current = await getCurrentSession();
  const headers = { "cache-control": "private, no-store", vary: "cookie" };
  if (!current) return NextResponse.json({ viewer: null }, { headers });
  const access = await getAccessProfile(current.user.id);
  return NextResponse.json(
    { viewer: { name: current.user.name, isStaff: access.isStaff } },
    { headers },
  );
}
