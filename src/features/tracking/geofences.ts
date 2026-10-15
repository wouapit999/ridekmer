import { parseGeometry, type GeofenceGeometry } from "@ridekmer/tracking";

import { recordAudit } from "@/server/audit";
import { db } from "@/server/db";

import type { Prisma } from "@/generated/prisma/client";
import type { GeofenceType } from "@/generated/prisma/enums";

export async function saveGeofence(input: {
  geofenceId?: string | null;
  name: string;
  type: GeofenceType;
  cityId?: string | null;
  geometry: GeofenceGeometry;
  alertOnExit: boolean;
  isActive: boolean;
  actorId: string;
}) {
  if (!parseGeometry(input.geometry)) throw new Error("INVALID_GEOMETRY");
  const data = {
    name: input.name,
    type: input.type,
    cityId: input.cityId ?? null,
    geometry: input.geometry as unknown as Prisma.InputJsonValue,
    alertOnExit: input.alertOnExit,
    isActive: input.isActive,
  };
  const geofence = input.geofenceId
    ? await db.geofence.update({ where: { id: input.geofenceId }, data })
    : await db.geofence.create({ data });
  await recordAudit({
    actorId: input.actorId,
    action: input.geofenceId ? "geofence.update" : "geofence.create",
    entityType: "Geofence",
    entityId: geofence.id,
    after: {
      name: input.name,
      type: input.type,
      alertOnExit: input.alertOnExit,
      isActive: input.isActive,
    },
  });
  return geofence;
}

export async function listGeofences() {
  return db.geofence.findMany({
    orderBy: [{ type: "asc" }, { name: "asc" }],
    include: { city: { select: { nameFr: true, nameEn: true } } },
  });
}

export async function activeGeofences() {
  const rows = await db.geofence.findMany({ where: { isActive: true } });
  return rows
    .map((g) => ({ ...g, parsed: parseGeometry(g.geometry) }))
    .filter((g): g is typeof g & { parsed: GeofenceGeometry } => g.parsed !== null);
}
