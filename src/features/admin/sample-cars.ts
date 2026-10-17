import {
  isSamplePlate,
  SAMPLE_PLATE_PREFIX,
  sampleVehicleData,
  SHOWCASE_VEHICLES,
} from "@/features/vehicles/showcase-data";
import { recordAudit } from "@/server/audit";
import { db } from "@/server/db";

/**
 * Sample cars added and removed from the administration. Only vehicles are created (no
 * people, no accounts, no bookings); they belong to RideKmer, are badged "Example" on the
 * site and cannot be booked (see isSamplePlate in the booking service).
 */
const sampleWhere = {
  registrationNumber: { startsWith: SAMPLE_PLATE_PREFIX },
} as const;

export async function countSampleVehicles(): Promise<number> {
  return db.vehicle.count({ where: { ...sampleWhere, deletedAt: null } });
}

export async function addSampleVehicles(actorId: string): Promise<{ added: number }> {
  const cities = await db.city.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });
  if (cities.length === 0) throw new Error("NO_CITY");
  const branches = await db.branch.findMany({ where: { isActive: true } });
  const fallback = cities.find((c) => c.slug === "douala") ?? cities[0]!;
  const now = new Date();
  let added = 0;
  for (const v of SHOWCASE_VEHICLES) {
    const own = cities.find((c) => c.slug === v.city);
    const city = own ?? fallback;
    const data = sampleVehicleData(
      v,
      {
        cityId: city.id,
        latitude: city.latitude,
        longitude: city.longitude,
        branchId: branches.find((b) => b.cityId === city.id)?.id ?? null,
        ownCity: Boolean(own),
        ownerProfileId: null,
      },
      now,
    );
    const existing = await db.vehicle.findUnique({ where: { registrationNumber: v.plate } });
    if (existing && !existing.deletedAt && existing.status === "ACTIVE") continue;
    await db.vehicle.upsert({
      where: { registrationNumber: v.plate },
      update: { ...data, deletedAt: null },
      create: data,
    });
    added += 1;
  }
  await recordAudit({
    actorId,
    action: "sample_vehicles.add",
    entityType: "Vehicle",
    after: { added, plates: SHOWCASE_VEHICLES.map((v) => v.plate) },
  });
  return { added };
}

export async function removeSampleVehicles(actorId: string): Promise<{ removed: number }> {
  const vehicles = await db.vehicle.findMany({
    where: { ...sampleWhere, deletedAt: null },
    select: { id: true, registrationNumber: true, _count: { select: { bookings: true } } },
  });
  let removed = 0;
  for (const v of vehicles) {
    if (!isSamplePlate(v.registrationNumber)) continue;
    const withdraw = () =>
      db.vehicle.update({
        where: { id: v.id },
        data: { status: "WITHDRAWN", deletedAt: new Date() },
      });
    if (v._count.bookings > 0) {
      // Demo databases may hold sample bookings: keep the history, take the car offline.
      await withdraw();
    } else {
      try {
        await db.vehicle.delete({ where: { id: v.id } });
      } catch {
        // Something else references the car (a hold, a tracker…): take it offline instead.
        await withdraw();
      }
    }
    removed += 1;
  }
  await recordAudit({
    actorId,
    action: "sample_vehicles.remove",
    entityType: "Vehicle",
    before: { plates: vehicles.map((v) => v.registrationNumber) },
    after: { removed },
  });
  return { removed };
}
