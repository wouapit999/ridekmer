import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/server/db";

let customerId: string;
let vehicleId: string;
const created: string[] = [];

beforeAll(async () => {
  const city = await db.city.findUniqueOrThrow({ where: { slug: "douala" } });
  const customer = await db.user.create({
    data: { email: `cust-${randomUUID()}@ridekmer.test`, name: "Constraint Test" },
  });
  customerId = customer.id;
  const vehicle = await db.vehicle.create({
    data: {
      registrationNumber: `TEST-${randomUUID().slice(0, 8)}`,
      ownershipModel: "RIDEKMER_OWNED",
      cityId: city.id,
      make: "Test",
      model: "Car",
      manufacturingYear: 2022,
      category: "SEDAN",
      transmission: "MANUAL",
      fuelType: "PETROL",
      seats: 5,
      dailyPriceXaf: 10000,
      securityDepositXaf: 50000,
    },
  });
  vehicleId = vehicle.id;
});

afterAll(async () => {
  await db.booking.deleteMany({ where: { vehicleId } });
  await db.vehicle.delete({ where: { id: vehicleId } });
  await db.user.delete({ where: { id: customerId } });
  await db.$disconnect();
});

function booking(
  reference: string,
  start: string,
  end: string,
  status: "CONFIRMED" | "CANCELLED" | "DRAFT",
) {
  return db.booking.create({
    data: {
      reference,
      customerId,
      vehicleId,
      status,
      startAt: new Date(start),
      endAt: new Date(end),
      rentalDays: 2,
    },
  });
}

describe("database-level invariants", () => {
  it("prevents overlapping confirmed bookings on the same vehicle", async () => {
    const a = await booking(
      `T-${randomUUID().slice(0, 6)}`,
      "2026-12-01T08:00:00Z",
      "2026-12-03T08:00:00Z",
      "CONFIRMED",
    );
    created.push(a.id);
    await expect(
      booking(
        `T-${randomUUID().slice(0, 6)}`,
        "2026-12-02T08:00:00Z",
        "2026-12-04T08:00:00Z",
        "CONFIRMED",
      ),
    ).rejects.toThrow(/Booking_no_overlap_excl|exclusion/i);
  });

  it("allows an adjacent booking and overlapping non-blocking statuses", async () => {
    await expect(
      booking(
        `T-${randomUUID().slice(0, 6)}`,
        "2026-12-03T08:00:00Z",
        "2026-12-05T08:00:00Z",
        "CONFIRMED",
      ),
    ).resolves.toBeDefined();
    await expect(
      booking(
        `T-${randomUUID().slice(0, 6)}`,
        "2026-12-01T08:00:00Z",
        "2026-12-03T08:00:00Z",
        "CANCELLED",
      ),
    ).resolves.toBeDefined();
    await expect(
      booking(
        `T-${randomUUID().slice(0, 6)}`,
        "2026-12-01T08:00:00Z",
        "2026-12-03T08:00:00Z",
        "DRAFT",
      ),
    ).resolves.toBeDefined();
  });

  it("rejects bookings whose end precedes their start", async () => {
    await expect(
      booking(
        `T-${randomUUID().slice(0, 6)}`,
        "2026-12-10T08:00:00Z",
        "2026-12-09T08:00:00Z",
        "DRAFT",
      ),
    ).rejects.toThrow();
  });

  it("keeps the audit log append-only", async () => {
    const entry = await db.auditLog.create({
      data: { action: "test.append_only", entityType: "Test", actorType: "SYSTEM" },
    });
    await expect(
      db.auditLog.update({ where: { id: entry.id }, data: { action: "tampered" } }),
    ).rejects.toThrow(/append-only/);
    await expect(db.auditLog.delete({ where: { id: entry.id } })).rejects.toThrow(/append-only/);
  });

  it("refuses negative money and ledger entries between the same account", async () => {
    const cash = await db.ledgerAccount.findUniqueOrThrow({ where: { key: "platform_cash" } });
    await expect(
      db.ledgerEntry.create({
        data: {
          type: "ADJUSTMENT",
          amountXaf: 100,
          debitAccountId: cash.id,
          creditAccountId: cash.id,
          description: "self",
          idempotencyKey: randomUUID(),
        },
      }),
    ).rejects.toThrow();
    const revenue = await db.ledgerAccount.findUniqueOrThrow({
      where: { key: "platform_revenue" },
    });
    await expect(
      db.ledgerEntry.create({
        data: {
          type: "ADJUSTMENT",
          amountXaf: 0,
          debitAccountId: cash.id,
          creditAccountId: revenue.id,
          description: "zero",
          idempotencyKey: randomUUID(),
        },
      }),
    ).rejects.toThrow();
  });
});
