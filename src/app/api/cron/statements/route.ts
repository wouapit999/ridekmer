import { NextResponse, type NextRequest } from "next/server";

import { postMissingLedgerEntries } from "@/features/finance/ledger";
import { issueMonthlyStatements } from "@/features/finance/statements";
import { logger } from "@/lib/logger";
import { assertCronRequest } from "@/server/cron/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Monthly (1st, 03:00 UTC): catch up ledger postings, then issue last month's owner statements. */
export async function GET(request: NextRequest) {
  const denied = assertCronRequest(request);
  if (denied) return denied;
  try {
    const ledger = await postMissingLedgerEntries();
    const statements = await issueMonthlyStatements(new Date());
    return NextResponse.json({ ok: true, ledger, statements });
  } catch (error) {
    logger.error("cron.statements.failed", { error });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
