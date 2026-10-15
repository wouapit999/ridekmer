import { describe, expect, it } from "vitest";

import { buildWhere, parseSearchParams, searchWindow } from "@/features/vehicles/search";

describe("vehicle search parameters", () => {
  it("parses and sanitises query parameters", () => {
    const params = parseSearchParams({
      city: "douala",
      minSeats: "5",
      maxPrice: "60000",
      drive: "chauffeur",
      page: ["2"],
      bogus: "x",
    });
    expect(params).toMatchObject({
      city: "douala",
      minSeats: 5,
      maxPrice: 60000,
      drive: "chauffeur",
      page: 2,
    });
    expect(params).not.toHaveProperty("bogus");
  });

  it("falls back to defaults on invalid input", () => {
    expect(parseSearchParams({ minSeats: "lots", page: "-1" })).toEqual({ page: 1 });
  });

  it("builds an availability window in Douala time", () => {
    const window = searchWindow({
      page: 1,
      pickupDate: "2026-11-01",
      pickupTime: "10:00",
      returnDate: "2026-11-03",
      returnTime: "10:00",
    });
    expect(window?.startAt.toISOString()).toBe("2026-11-01T09:00:00.000Z");
    expect(window?.endAt.toISOString()).toBe("2026-11-03T09:00:00.000Z");
    expect(
      searchWindow({ page: 1, pickupDate: "2026-11-03", returnDate: "2026-11-01" }),
    ).toBeNull();
  });

  it("only lists published, approved vehicles with valid documents", () => {
    const where = buildWhere({ page: 1 });
    expect(where).toMatchObject({ status: "ACTIVE", documentsValid: true, deletedAt: null });
  });

  it("excludes vehicles with overlapping bookings, blocks and holds when dates are given", () => {
    const where = buildWhere({
      page: 1,
      pickupDate: "2026-11-01",
      returnDate: "2026-11-03",
      drive: "self",
    });
    expect(where.bookings).toBeDefined();
    expect(where.availabilityBlocks).toBeDefined();
    expect(where.reservationHolds).toBeDefined();
    expect(where.selfDriveAllowed).toBe(true);
  });
});
