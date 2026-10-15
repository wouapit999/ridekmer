import { NextResponse, type NextRequest } from "next/server";

import { getStatementForOwner, statementCsvRows } from "@/features/finance/statements";
import { toCsv } from "@/lib/csv";
import { recordAudit } from "@/server/audit";
import { getCurrentSession } from "@/server/auth/session";
import { db } from "@/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Owner downloads their own statement as CSV (object-level check). */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const profile = await db.ownerProfile.findUnique({
    where: { userId: current.user.id },
    select: { id: true },
  });
  const statement = profile ? await getStatementForOwner(id, profile.id) : null;
  if (!statement) return NextResponse.json({ error: "not found" }, { status: 404 });
  await recordAudit({
    actorId: current.user.id,
    action: "statement.download",
    entityType: "OwnerStatement",
    entityId: statement.id,
  });
  const csv = "﻿" + toCsv(statementCsvRows(statement));
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ridekmer-statement-${statement.key.split(":")[1]}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
