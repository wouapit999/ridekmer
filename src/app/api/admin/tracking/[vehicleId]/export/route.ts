import { NextResponse, type NextRequest } from "next/server";

import { getVehicleTrack } from "@/features/tracking/queries";
import { toCsv } from "@/lib/csv";
import { fromDoualaLocal } from "@/lib/dates";
import { requirePermissionOrThrow } from "@/server/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Location history export (tracking.export); logged as an EXPORT access with the stated reason. */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ vehicleId: string }> },
) {
  const { vehicleId } = await context.params;
  let user;
  try {
    ({ user } = await requirePermissionOrThrow("tracking.export"));
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const sp = request.nextUrl.searchParams;
  const reason = (sp.get("reason") ?? "").trim();
  if (reason.length < 5) return NextResponse.json({ error: "reason required" }, { status: 400 });
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.get("from") ?? "")
    ? fromDoualaLocal(`${sp.get("from")}T00:00`)
    : new Date(Date.now() - 7 * 86_400_000);
  const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.get("to") ?? "")
    ? fromDoualaLocal(`${sp.get("to")}T23:59`)
    : new Date();
  const track = await getVehicleTrack({
    vehicleId,
    from,
    to,
    viewerId: user.id,
    reason,
    accessType: "EXPORT",
  });
  if (!track) return NextResponse.json({ error: "not found" }, { status: 404 });
  const rows = track.fixes.map((f) => ({
    recorded_at: f.recordedAt,
    latitude: f.latitude,
    longitude: f.longitude,
    speed_kmh: f.speedKmh ?? "",
    heading: f.heading ?? "",
    ignition: f.ignitionOn ?? "",
    inside_geofences: f.insideGeofences.join("|"),
  }));
  const csv =
    "﻿" +
    toCsv(rows, [
      "recorded_at",
      "latitude",
      "longitude",
      "speed_kmh",
      "heading",
      "ignition",
      "inside_geofences",
    ]);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ridekmer-track-${track.vehicle.registrationNumber}-${from.toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
