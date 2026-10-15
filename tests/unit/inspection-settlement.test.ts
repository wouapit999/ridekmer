import { describe, expect, it } from "vitest";

import { computeSettlement } from "@/features/inspections/settlement";

const base = {
  pickupMileageKm: 10_000,
  returnMileageKm: 10_400,
  pickupFuelPercent: 100,
  returnFuelPercent: 100,
  rentalDays: 2,
  kmAllowancePerDay: 150,
  extraKmRateXaf: 150,
  newDamageEstimatesXaf: [] as number[],
  scheduledEndAt: new Date("2026-11-02T09:00:00Z"),
  returnedAt: new Date("2026-11-02T09:30:00Z"),
  lateReturnFeeXafPerDay: 25_000,
  fuelAdjustmentXafPerPercent: 1_000,
  depositXaf: 100_000,
};

describe("return settlement", () => {
  it("charges extra kilometres above the allowance and nothing else when on time", () => {
    const s = computeSettlement(base);
    expect(s.drivenKm).toBe(400);
    expect(s.extraKmXaf).toBe(100 * 150);
    expect(s.fuelXaf).toBe(0);
    expect(s.lateXaf).toBe(0);
    expect(s.deductionXaf).toBe(15_000);
    expect(s.depositRefundXaf).toBe(85_000);
    expect(s.additionalChargeXaf).toBe(0);
    expect(s.lines.map((l) => l.key)).toEqual(["extraKm"]);
  });

  it("adds fuel, new damage and late days with a one-hour grace period", () => {
    const s = computeSettlement({
      ...base,
      returnMileageKm: 10_100,
      returnFuelPercent: 60,
      newDamageEstimatesXaf: [30_000, 5_000],
      returnedAt: new Date("2026-11-03T11:00:00Z"), // 26 h late → 2 days
    });
    expect(s.extraKmXaf).toBe(0);
    expect(s.fuelXaf).toBe(40 * 1_000);
    expect(s.damageXaf).toBe(35_000);
    expect(s.lateDays).toBe(2);
    expect(s.lateXaf).toBe(50_000);
    expect(s.deductionXaf).toBe(125_000);
    expect(s.depositRefundXaf).toBe(0);
    expect(s.additionalChargeXaf).toBe(25_000);
  });

  it("ignores missing readings, unlimited mileage and more fuel than at pickup", () => {
    const s = computeSettlement({
      ...base,
      pickupMileageKm: null,
      kmAllowancePerDay: null,
      returnFuelPercent: 100,
      pickupFuelPercent: 80,
    });
    expect(s.drivenKm).toBeNull();
    expect(s.deductionXaf).toBe(0);
    expect(s.depositRefundXaf).toBe(100_000);
  });

  it("never produces negative or fractional amounts", () => {
    const s = computeSettlement({
      ...base,
      newDamageEstimatesXaf: [-5, 10.9],
      returnMileageKm: 9_000,
    });
    expect(s.damageXaf).toBe(10);
    expect(s.drivenKm).toBe(0);
    expect(Number.isInteger(s.deductionXaf)).toBe(true);
  });
});
