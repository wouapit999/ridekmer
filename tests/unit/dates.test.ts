import { describe, expect, it } from "vitest";

import { formatIsoDate, fromDoualaLocal, rentalDaysBetween, startOfDoualaDay } from "@/lib/dates";

describe("dates (Africa/Douala, UTC+1 all year)", () => {
  it("interprets local wall-clock times in Douala", () => {
    expect(fromDoualaLocal("2026-10-20T09:00").toISOString()).toBe("2026-10-20T08:00:00.000Z");
  });

  it("counts started days as full days with a minimum of one", () => {
    const start = fromDoualaLocal("2026-10-20T09:00");
    expect(rentalDaysBetween(start, fromDoualaLocal("2026-10-21T09:00"))).toBe(1);
    expect(rentalDaysBetween(start, fromDoualaLocal("2026-10-21T09:01"))).toBe(2);
    expect(rentalDaysBetween(start, fromDoualaLocal("2026-10-20T15:00"))).toBe(1);
    expect(rentalDaysBetween(start, fromDoualaLocal("2026-10-27T09:00"))).toBe(7);
  });

  it("rejects inverted ranges", () => {
    const start = fromDoualaLocal("2026-10-20T09:00");
    expect(() => rentalDaysBetween(start, start)).toThrow(RangeError);
  });

  it("computes start of day in Douala, not UTC", () => {
    const late = new Date("2026-10-20T23:30:00.000Z"); // 00:30 on the 21st in Douala
    expect(startOfDoualaDay(late).toISOString()).toBe("2026-10-20T23:00:00.000Z");
    expect(formatIsoDate(late)).toBe("2026-10-21");
  });
});
