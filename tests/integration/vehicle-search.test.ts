import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { searchVehicles } from "@/features/vehicles/search";
import { db } from "@/server/db";

let vehicleId: string;
let customerId: string;
const plate = `SRCH-${randomUUID().slice(0, 6)}`;

beforeAll(async () => {
  const city = await db.city.findUniqueOrThrow({ where: { slug: "yaounde" } });
  const vehicle = await db.vehicle.create({
    data: {
      registrationNumber: plate,
      ownershipModel: "RIDEKMER_OWNED",
      cityId: city.id,
      make: "SearchMake",
      model: "SearchModel",
      manufacturingYear: 2023,
      category: "SUV",
      transmission: "AUTOMATIC",
      fuelType: "DIESEL",
      seats: 7,
      dailyPriceXaf: 45000,
      securityDepositXaf: 200000,
      status: "ACTIVE",
      documentsValid: true,
      publishedAt: new Date(),
    },
  });
  vehicleId = vehicle.id;
  const customer = await db.user.create({
    data: { email: `search-${randomUUID()}@ridekmer.test`, name: "Search Test" },
  });
  customerId = customer.id;
  await db.booking.create({
    data: {
      reference: `S-${randomUUID().slice(0, 6)}`,
      customerId,
      vehicleId,
      status: "CONFIRMED",
      startAt: new Date("2027-01-10T08:00:00Z"),
      endAt: new Date("2027-01-12T08:00:00Z"),
      rentalDays: 2,
    },
  });
});

afterAll(async () => {
  await db.booking.deleteMany({ where: { vehicleId } });
  await db.vehicle.delete({ where: { id: vehicleId } });
  await db.user.delete({ where: { id: customerId } });
  await db.$disconnect();
});

describe("vehicle search against the database", () => {
  it("finds the vehicle by city and category", async () => {
    const result = await searchVehicles({
      page: 1,
      city: "yaounde",
      category: "SUV",
      make: "SearchMake",
    });
    expect(result.vehicles.map((v) => v.id)).toContain(vehicleId);
  });

  it("hides the vehicle for dates overlapping a confirmed booking", async () => {
    const overlapping = await searchVehicles({
      page: 1,
      make: "SearchMake",
      pickupDate: "2027-01-11",
      returnDate: "2027-01-13",
    });
    expect(overlapping.vehicles.map((v) => v.id)).not.toContain(vehicleId);
    const free = await searchVehicles({
      page: 1,
      make: "SearchMake",
      pickupDate: "2027-01-12",
      returnDate: "2027-01-14",
    });
    expect(free.vehicles.map((v) => v.id)).toContain(vehicleId);
  });

  it("hides vehicles whose documents are invalid", async () => {
    await db.vehicle.update({ where: { id: vehicleId }, data: { documentsValid: false } });
    const result = await searchVehicles({ page: 1, make: "SearchMake" });
    expect(result.vehicles.map((v) => v.id)).not.toContain(vehicleId);
    await db.vehicle.update({ where: { id: vehicleId }, data: { documentsValid: true } });
  });
});
