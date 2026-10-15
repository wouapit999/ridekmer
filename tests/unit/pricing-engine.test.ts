import { describe, expect, it } from "vitest";

import {
  computeCancellationFee,
  computeLateReturnFee,
  computeQuote,
  dailyPathPrice,
  packagePathPrice,
  type QuoteInput,
} from "@/features/pricing/engine";

const days = (n: number, from = "2026-11-02") =>
  Array.from({ length: n }, (_, i) =>
    new Date(Date.UTC(2026, 10, 2 + i)).toISOString().slice(0, 10),
  ).map((d, i) => (i === 0 ? from : d));

const base: QuoteInput = {
  days: days(3),
  dailyRateXaf: 35000,
  weeklyRateXaf: 220000,
  monthlyRateXaf: 800000,
  securityDepositXaf: 150000,
  dailyKmAllowance: 200,
  extraKmRateXaf: 150,
  chauffeur: false,
  chauffeurDailyFeeXaf: 15000,
  delivery: false,
  deliveryFeeXaf: 5000,
  returnPickup: false,
  returnPickupFeeXaf: 5000,
  additionalDrivers: 0,
  additionalDriverFeeXafPerDay: 5000,
  addOns: [],
  serviceFeeBps: 500,
  taxBps: 0,
  commissionBps: 2000,
};

describe("pricing engine", () => {
  it("is deterministic and integer-only", () => {
    const a = computeQuote(base);
    const b = computeQuote(base);
    expect(a).toEqual(b);
    for (const [k, v] of Object.entries(a))
      if (typeof v === "number") expect(Number.isInteger(v), k).toBe(true);
    expect(a.baseRentalXaf).toBe(105000);
    expect(a.serviceFeeXaf).toBe(5250);
    expect(a.totalRentalXaf).toBe(110250);
    expect(a.grandTotalXaf).toBe(260250);
    expect(a.commissionXaf).toBe(21000);
    expect(a.ownerShareXaf).toBe(84000);
  });

  it("uses weekly and monthly packages when cheaper than daily × days", () => {
    expect(packagePathPrice(7, 35000, 220000, null)).toBe(220000);
    expect(packagePathPrice(10, 35000, 220000, null)).toBe(220000 + 3 * 35000);
    expect(packagePathPrice(30, 35000, 220000, 800000)).toBe(800000 + 2 * 35000);
    expect(packagePathPrice(7, 10000, 90000, null)).toBe(70000); // package never above daily total
    const q = computeQuote({ ...base, days: days(7) });
    expect(q.baseRentalXaf).toBe(220000);
    expect(q.lines[0]?.detail).toBe("package");
  });

  it("applies weekend and seasonal multipliers per day", () => {
    // 2026-11-07 is a Saturday, 2026-11-08 a Sunday
    const weekend = dailyPathPrice(["2026-11-06", "2026-11-07", "2026-11-08"], 10000, [
      { name: "weekend", weekend: true, percentBps: 12000 },
    ]);
    expect(weekend.total).toBe(10000 + 12000 + 12000);
    expect(weekend.applied).toEqual(["weekend"]);
    const season = dailyPathPrice(["2026-12-24", "2026-12-25"], 10000, [
      { name: "xmas", dates: new Set(["2026-12-25"]), percentBps: 15000 },
    ]);
    expect(season.total).toBe(25000);
  });

  it("applies long-duration discounts, chauffeur, delivery and additional driver fees", () => {
    const q = computeQuote({
      ...base,
      days: days(10),
      longDurationRules: [{ name: "10d", minDays: 10, percentBps: 1000 }],
      chauffeur: true,
      delivery: true,
      returnPickup: true,
      additionalDrivers: 2,
    });
    expect(q.baseRentalXaf).toBe(220000 + 3 * 35000); // 325000 package
    expect(q.discountXaf).toBe(32500);
    expect(q.chauffeurFeeXaf).toBe(150000);
    expect(q.deliveryFeeXaf).toBe(5000);
    expect(q.returnPickupFeeXaf).toBe(5000);
    expect(q.additionalDriverXaf).toBe(2 * 5000 * 10);
    const subtotal = 325000 - 32500 + 150000 + 5000 + 5000 + 100000;
    expect(q.serviceFeeXaf).toBe(Math.round(subtotal * 0.05));
    expect(q.totalRentalXaf).toBe(subtotal + q.serviceFeeXaf);
  });

  it("applies promo codes with caps, minimums and never below zero", () => {
    const pct = computeQuote({
      ...base,
      promo: {
        code: "WELCOME10",
        discountType: "PERCENTAGE",
        percentBps: 1000,
        maxDiscountXaf: 5000,
      },
    });
    expect(pct.discountXaf).toBe(5000);
    expect(pct.promoApplied).toBe("WELCOME10");
    const min = computeQuote({
      ...base,
      promo: {
        code: "BIG",
        discountType: "FIXED_AMOUNT",
        amountXaf: 20000,
        minBookingXaf: 1_000_000,
      },
    });
    expect(min.promoApplied).toBeNull();
    expect(min.promoRejectedReason).toBe("MIN_BOOKING");
    const huge = computeQuote({
      ...base,
      promo: { code: "FREE", discountType: "FIXED_AMOUNT", amountXaf: 9_999_999 },
    });
    expect(huge.discountXaf).toBe(105000);
    expect(huge.totalRentalXaf).toBe(0);
    expect(huge.ownerShareXaf).toBe(0);
  });

  it("applies tax after the service fee", () => {
    const q = computeQuote({ ...base, taxBps: 1925 });
    expect(q.taxXaf).toBe(Math.round((105000 + 5250) * 0.1925));
  });

  it("gives RideKmer-owned vehicles a full commission", () => {
    const q = computeQuote({ ...base, commissionBps: 10000 });
    expect(q.ownerShareXaf).toBe(0);
    expect(q.commissionXaf).toBe(105000);
  });

  it("rejects empty rentals", () => {
    expect(() => computeQuote({ ...base, days: [] })).toThrow(RangeError);
  });
});

describe("cancellation and late-return fees", () => {
  it("is free before the window and a percentage afterwards", () => {
    expect(
      computeCancellationFee({
        totalRentalXaf: 110250,
        hoursBeforePickup: 72,
        freeHours: 48,
        lateFeeBps: 3000,
      }),
    ).toBe(0);
    expect(
      computeCancellationFee({
        totalRentalXaf: 110250,
        hoursBeforePickup: 12,
        freeHours: 48,
        lateFeeBps: 3000,
      }),
    ).toBe(33075);
    expect(
      computeCancellationFee({
        totalRentalXaf: 110250,
        hoursBeforePickup: 12,
        freeHours: 48,
        lateFeeBps: 3000,
        noShow: true,
      }),
    ).toBe(110250);
  });

  it("charges late return per started day after a grace period", () => {
    expect(computeLateReturnFee({ minutesLate: 30, feePerDayXaf: 25000 })).toBe(0);
    expect(computeLateReturnFee({ minutesLate: 90, feePerDayXaf: 25000 })).toBe(25000);
    expect(computeLateReturnFee({ minutesLate: 60 + 24 * 60 + 1, feePerDayXaf: 25000 })).toBe(
      50000,
    );
  });
});
