import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { BootstrapRefusedError, bootstrapSuperAdmin } from "@/server/auth/bootstrap-admin";
import { assertCronRequest } from "@/server/cron/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  email: z.string().email().optional(),
  name: z.string().trim().min(2).max(120).optional(),
  locale: z.enum(["fr", "en"]).optional(),
});

/**
 * One-time bootstrap of the first super administrator. Protected like the cron routes
 * (`Authorization: Bearer $CRON_SECRET`), so it can be called from the "Database" GitHub
 * workflow or from a terminal without a database client. Refuses once an administrator
 * exists (409). See docs/OPERATIONS_RUNBOOK.md.
 */
export async function POST(request: NextRequest) {
  const denied = assertCronRequest(request);
  if (denied) return denied;

  const raw = await request.text();
  const parsed = bodySchema.safeParse(raw ? JSON.parse(raw) : {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const email = parsed.data.email ?? getEnv().BOOTSTRAP_ADMIN_EMAIL;
  if (!email) {
    return NextResponse.json(
      { error: "email_required", detail: 'Pass {"email"} or set BOOTSTRAP_ADMIN_EMAIL.' },
      { status: 400 },
    );
  }

  try {
    const result = await bootstrapSuperAdmin({
      email,
      name: parsed.data.name,
      locale: parsed.data.locale,
    });
    const status =
      result.outcome === "created" ? 201 : result.outcome === "role_granted" ? 200 : 409;
    return NextResponse.json(result, { status });
  } catch (error) {
    if (error instanceof BootstrapRefusedError) {
      return NextResponse.json(
        { error: "refused", detail: error.message },
        { status: error.status },
      );
    }
    logger.error("bootstrap.failed", { error });
    return NextResponse.json({ error: "bootstrap_failed" }, { status: 500 });
  }
}
