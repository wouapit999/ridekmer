import { describe, expect, it } from "vitest";

import {
  basicsSchema,
  formToObject,
  issuesToErrors,
  pricingSchema,
} from "@/features/vehicles/schemas";
import { VEHICLE_TRANSITIONS, canTransitionVehicle } from "@/features/vehicles/service";

describe("vehicle onboarding schemas", () => {
  it("reserves EX- plates for the administration's sample cars", () => {
    const base = {
      make: "Toyota",
      model: "Corolla",
      manufacturingYear: 2020,
      category: "SEDAN",
      transmission: "MANUAL",
      fuelType: "PETROL",
      seats: 5,
      currentMileageKm: 1000,
      cityId: "c1",
    };
    const sample = basicsSchema.safeParse({ ...base, registrationNumber: "ex-101-dla" });
    expect(sample.success).toBe(false);
    expect(issuesToErrors(sample.error!).registrationNumber).toBe("RESERVED_PLATE");
    expect(basicsSchema.safeParse({ ...base, registrationNumber: "LT 123 AB" }).success).toBe(true);
  });

  it("normalises registration numbers and coerces numbers", () => {
    const parsed = basicsSchema.parse({
      registrationNumber: " lt 123 ab ",
      make: "Toyota",
      model: "Corolla",
      manufacturingYear: "2021",
      category: "SEDAN",
      transmission: "AUTOMATIC",
      fuelType: "PETROL",
      seats: "5",
      currentMileageKm: "12000",
      cityId: "c1",
      engineCapacityCc: "",
    });
    expect(parsed.registrationNumber).toBe("LT 123 AB");
    expect(parsed.manufacturingYear).toBe(2021);
    expect(parsed.engineCapacityCc).toBeUndefined();
  });

  it("rejects pricing that allows neither self-drive nor chauffeur", () => {
    const result = pricingSchema.safeParse({
      dailyPriceXaf: "35000",
      securityDepositXaf: "100000",
      selfDriveAllowed: "false",
      chauffeurAvailable: "false",
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(issuesToErrors(result.error)).toMatchObject({ selfDriveAllowed: "driveOption" });
  });

  it("requires a chauffeur fee when chauffeur-driven and validates max >= min days", () => {
    const noFee = pricingSchema.safeParse({
      dailyPriceXaf: "35000",
      securityDepositXaf: "100000",
      selfDriveAllowed: "on",
      chauffeurAvailable: "on",
    });
    expect(noFee.success).toBe(false);
    const badDays = pricingSchema.safeParse({
      dailyPriceXaf: "35000",
      securityDepositXaf: "100000",
      selfDriveAllowed: "on",
      minRentalDays: "5",
      maxRentalDays: "2",
    });
    expect(badDays.success).toBe(false);
    const ok = pricingSchema.safeParse({
      dailyPriceXaf: "35000",
      securityDepositXaf: "100000",
      selfDriveAllowed: "on",
      chauffeurAvailable: "on",
      chauffeurDailyFeeXaf: "15000",
    });
    expect(ok.success).toBe(true);
  });

  it("collects repeated form keys into arrays", () => {
    const fd = new FormData();
    fd.append("safetyEquipment[]", "abs");
    fd.append("safetyEquipment[]", "airbags");
    fd.append("make", "Kia");
    expect(formToObject(fd)).toEqual({ safetyEquipment: ["abs", "airbags"], make: "Kia" });
  });
});

describe("vehicle status machine", () => {
  it("only allows documented transitions", () => {
    expect(canTransitionVehicle("DRAFT", "SUBMITTED")).toBe(true);
    expect(canTransitionVehicle("DRAFT", "ACTIVE")).toBe(false);
    expect(canTransitionVehicle("SUBMITTED", "APPROVED")).toBe(true);
    expect(canTransitionVehicle("ACTIVE", "UNAVAILABLE_DOCUMENTS")).toBe(true);
    expect(canTransitionVehicle("WITHDRAWN", "ACTIVE")).toBe(false);
    expect(canTransitionVehicle("REJECTED", "SUBMITTED")).toBe(true);
    expect(VEHICLE_TRANSITIONS.WITHDRAWN).toEqual([]);
  });
});
