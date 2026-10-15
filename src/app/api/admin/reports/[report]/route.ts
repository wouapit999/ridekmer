import { NextResponse, type NextRequest } from "next/server";

import { REPORT_KEYS, reportRows, type ReportKey } from "@/features/finance/queries";
import { toCsv } from "@/lib/csv";
import { fromDoualaLocal } from "@/lib/dates";
import { recordAudit } from "@/server/audit";
import { requirePermissionOrThrow } from "@/server/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** CSV exports (report.export). Cells are escaped against spreadsheet formula injection. */
export async function GET(request: NextRequest, context: { params: Promise<{ report: string }> }) {
  const { report } = await context.params;
  if (!REPORT_KEYS.includes(report as ReportKey))
    return NextResponse.json({ error: "unknown report" }, { status: 404 });
  let user;
  try {
    ({ user } = await requirePermissionOrThrow("report.export"));
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const sp = request.nextUrl.searchParams;
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.get("from") ?? "")
    ? fromDoualaLocal(`${sp.get("from")}T00:00`)
    : new Date(Date.now() - 31 * 86_400_000);
  const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.get("to") ?? "")
    ? fromDoualaLocal(`${sp.get("to")}T23:59`)
    : new Date();
  const rows = await reportRows(report as ReportKey, from, to);
  await recordAudit({
    actorId: user.id,
    action: "report.export",
    entityType: "Report",
    entityId: report,
    after: { from, to, rows: rows.length },
  });
  const csv = "﻿" + toCsv(rows);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ridekmer-${report}-${from.toISOString().slice(0, 10)}-${to.toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
