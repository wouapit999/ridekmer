import { headers } from "next/headers";
import { trackDistanceKm } from "@ridekmer/tracking";

import { db } from "@/server/db";

import type { TrackingAccessType } from "@/generated/prisma/enums";

/** Every read of location data is logged with who, what, the range and the stated reason. */
export async function logTrackingAccess(input: {
  userId: string;
  vehicleId: string;
  accessType: TrackingAccessType;
  rangeStart?: Date | null;
  rangeEnd?: Date | null;
  reason?: string | null;
}) {
  let ipAddress: string | undefined;
  let userAgent: string | undefined;
  try {
    const h = await headers();
    ipAddress = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? undefined;
    userAgent = h.get("user-agent") ?? undefined;
  } catch {
    // outside a request (tests, jobs)
  }
  await db.trackingAccessLog.create({
    data: {
      userId: input.userId,
      vehicleId: input.vehicleId,
      accessType: input.accessType,
      rangeStart: input.rangeStart ?? null,
      rangeEnd: input.rangeEnd ?? null,
      reason: input.reason ?? null,
      ipAddress,
      userAgent,
    },
  });
}

export interface FleetVehicle {
  vehicleId: string;
  make: string;
  model: string;
  registrationNumber: string;
  status: string;
  cityName: { fr: string; en: string };
  deviceStatus: string | null;
  deviceType: string | null;
  lastSeenAt: Date | null;
  latitude: number | null;
  longitude: number | null;
  recordedAt: Date | null;
  speedKmh: number | null;
  ignitionOn: boolean | null;
  insideGeofences: string[];
  activeBookingReference: string | null;
}

/** Latest fix per vehicle with an active tracker (one query with DISTINCT ON). */
export async function getFleetSnapshot(viewerId: string): Promise<FleetVehicle[]> {
  const vehicles = await db.vehicle.findMany({
    where: { deletedAt: null, trackerAssignments: { some: { unassignedAt: null } } },
    select: {
      id: true,
      make: true,
      model: true,
      registrationNumber: true,
      status: true,
      city: { select: { nameFr: true, nameEn: true } },
      trackerAssignments: {
        where: { unassignedAt: null },
        take: 1,
        include: { device: { select: { status: true, type: true, lastSeenAt: true } } },
      },
      bookings: {
        where: { status: { in: ["ACTIVE", "EXTENSION_REQUESTED"] } },
        select: { reference: true },
        take: 1,
      },
    },
    orderBy: { registrationNumber: "asc" },
  });
  const ids = vehicles.map((v) => v.id);
  const latest = ids.length
    ? await db.$queryRaw<
        Array<{
          vehicleId: string;
          latitude: number | null;
          longitude: number | null;
          recordedAt: Date;
          speedKmh: number | null;
          ignitionOn: boolean | null;
          insideGeofences: string[];
        }>
      >`
        SELECT DISTINCT ON ("vehicleId") "vehicleId", latitude, longitude, "recordedAt", "speedKmh", "ignitionOn", "insideGeofences"
        FROM "TrackingEvent"
        WHERE "vehicleId" = ANY(${ids}) AND type = 'LOCATION' AND latitude IS NOT NULL
        ORDER BY "vehicleId", "recordedAt" DESC`
    : [];
  const byVehicle = new Map(latest.map((l) => [l.vehicleId, l]));
  await logTrackingAccess({
    userId: viewerId,
    vehicleId: "FLEET",
    accessType: "VIEW_CURRENT",
    reason: "fleet map",
  });
  return vehicles.map((v) => {
    const l = byVehicle.get(v.id);
    const device = v.trackerAssignments[0]?.device ?? null;
    return {
      vehicleId: v.id,
      make: v.make,
      model: v.model,
      registrationNumber: v.registrationNumber,
      status: v.status,
      cityName: { fr: v.city.nameFr, en: v.city.nameEn },
      deviceStatus: device?.status ?? null,
      deviceType: device?.type ?? null,
      lastSeenAt: device?.lastSeenAt ?? null,
      latitude: l?.latitude ?? null,
      longitude: l?.longitude ?? null,
      recordedAt: l?.recordedAt ?? null,
      speedKmh: l?.speedKmh ?? null,
      ignitionOn: l?.ignitionOn ?? null,
      insideGeofences: l?.insideGeofences ?? [],
      activeBookingReference: v.bookings[0]?.reference ?? null,
    };
  });
}

/** Location history for one vehicle over a bounded range; a reason is mandatory and logged. */
export async function getVehicleTrack(input: {
  vehicleId: string;
  from: Date;
  to: Date;
  viewerId: string;
  reason: string;
  accessType?: TrackingAccessType;
}) {
  const maxRangeMs = 31 * 86_400_000;
  const to = input.to;
  const from =
    to.getTime() - input.from.getTime() > maxRangeMs
      ? new Date(to.getTime() - maxRangeMs)
      : input.from;
  const [vehicle, events] = await Promise.all([
    db.vehicle.findUnique({
      where: { id: input.vehicleId },
      select: { id: true, make: true, model: true, registrationNumber: true, ownershipModel: true },
    }),
    db.trackingEvent.findMany({
      where: { vehicleId: input.vehicleId, recordedAt: { gte: from, lte: to } },
      orderBy: { recordedAt: "asc" },
      take: 5000,
    }),
  ]);
  if (!vehicle) return null;
  await logTrackingAccess({
    userId: input.viewerId,
    vehicleId: input.vehicleId,
    accessType: input.accessType ?? "VIEW_HISTORY",
    rangeStart: from,
    rangeEnd: to,
    reason: input.reason,
  });
  const fixes = events.filter(
    (e) => e.type === "LOCATION" && e.latitude !== null && e.longitude !== null,
  );
  const points = fixes.map((e) => ({ latitude: e.latitude!, longitude: e.longitude! }));
  const other = events.filter((e) => e.type !== "LOCATION");
  return {
    vehicle,
    from,
    to,
    fixes,
    other,
    distanceKm: trackDistanceKm(points),
    trips: summariseTrips(fixes),
  };
}

/** Split fixes into trips on ignition-off / long gaps (> 15 min) and compute distances. */
export function summariseTrips(
  fixes: Array<{
    recordedAt: Date;
    latitude: number | null;
    longitude: number | null;
    ignitionOn: boolean | null;
  }>,
) {
  const trips: Array<{ startAt: Date; endAt: Date; distanceKm: number; points: number }> = [];
  let current: typeof fixes = [];
  const flush = () => {
    if (current.length >= 2) {
      trips.push({
        startAt: current[0]!.recordedAt,
        endAt: current.at(-1)!.recordedAt,
        distanceKm: trackDistanceKm(
          current.map((f) => ({ latitude: f.latitude!, longitude: f.longitude! })),
        ),
        points: current.length,
      });
    }
    current = [];
  };
  for (const f of fixes) {
    const prev = current.at(-1);
    if (
      prev &&
      (f.recordedAt.getTime() - prev.recordedAt.getTime() > 15 * 60_000 ||
        (prev.ignitionOn === false && f.ignitionOn === false))
    )
      flush();
    current.push(f);
  }
  flush();
  return trips;
}

export async function listAccessLogs(filter: { vehicleId?: string; page: number }, pageSize = 50) {
  const where = filter.vehicleId ? { vehicleId: filter.vehicleId } : {};
  const [total, logs] = await Promise.all([
    db.trackingAccessLog.count({ where }),
    db.trackingAccessLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (filter.page - 1) * pageSize,
      take: pageSize,
      include: { user: { select: { name: true, email: true } } },
    }),
  ]);
  return { total, logs, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function latestFixForVehicle(vehicleId: string) {
  return db.trackingEvent.findFirst({
    where: { vehicleId, type: "LOCATION", latitude: { not: null } },
    orderBy: { recordedAt: "desc" },
  });
}
