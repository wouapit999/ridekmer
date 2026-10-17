import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  addSampleVehicles,
  countSampleVehicles,
  removeSampleVehicles,
} from "@/features/admin/sample-cars";
import { BookingError, quoteBooking } from "@/features/bookings/service";
import { SHOWCASE_VEHICLES } from "@/features/vehicles/showcase-data";
import { db } from "@/server/db";

let adminId: string;
let realVehicleId: string;

beforeAll(async () => {
  const admin = await db.user.create({
    data: { email: `samples-${randomUUID()}@ridekmer.test`, name: "Samples Admin" },
  });
  adminId = admin.id;
  const city = await db.city.findUniqueOrThrow({ where: { slug: "douala" } });
  const real = await db.vehicle.create({
    data: {
      registrationNumber: `LT ${randomUUID().slice(0, 4)} RL`,
      ownershipModel: "RIDEKMER_OWNED",
      cityId: city.id,
      make: "Toyota",
      model: "Corolla",
      manufacturingYear: 2020,
      category: "SEDAN",
      transmission: "MANUAL",
      fuelType: "PETROL",
      seats: 5,
      dailyPriceXaf: 25000,
      securityDepositXaf: 100000,
      status: "ACTIVE",
      documentsValid: true,
      publishedAt: new Date(),
    },
  });
  realVehicleId = real.id;
  await removeSampleVehicles(adminId);
});

afterAll(async () => {
  await removeSampleVehicles(adminId);
  await db.vehicle.delete({ where: { id: realVehicleId } });
  // The admin user stays: audit rows (append-only by design) reference it.
  await db.$disconnect();
});

describe("sample cars from the administration", () => {
  it("adds the 10 sample cars once, owned by RideKmer, and audits it", async () => {
    expect(await addSampleVehicles(adminId)).toEqual({ added: SHOWCASE_VEHICLES.length });
    expect(await countSampleVehicles()).toBe(SHOWCASE_VEHICLES.length);
    expect(await addSampleVehicles(adminId)).toEqual({ added: 0 });
    const samples = await db.vehicle.findMany({
      where: { registrationNumber: { startsWith: "EX-" } },
    });
    expect(samples.every((v) => v.ownerProfileId === null && v.status === "ACTIVE")).toBe(true);
    expect(
      await db.auditLog.count({ where: { actorId: adminId, action: "sample_vehicles.add" } }),
    ).toBe(2);
  });

  it("shows a price for a sample car but refuses to book it", async () => {
    const sample = await db.vehicle.findFirstOrThrow({
      where: { registrationNumber: "EX-101-DLA" },
    });
    const start = new Date(Date.now() + 10 * 864e5);
    const window = { startAt: start, endAt: new Date(start.getTime() + 2 * 864e5) };
    const options = {
      chauffeur: false,
      delivery: false,
      returnPickup: false,
      additionalDrivers: 0,
    };
    await expect(quoteBooking(sample.id, window, options)).rejects.toBeInstanceOf(BookingError);
    const quote = await quoteBooking(sample.id, window, options, null, new Date(), {
      allowSample: true,
    });
    expect(quote.quote.totalRentalXaf).toBeGreaterThan(0);
  });

  it("removes only sample cars", async () => {
    expect(await removeSampleVehicles(adminId)).toEqual({ removed: SHOWCASE_VEHICLES.length });
    expect(await countSampleVehicles()).toBe(0);
    expect(await db.vehicle.findUnique({ where: { id: realVehicleId } })).not.toBeNull();
  });
});
