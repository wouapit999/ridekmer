import { describe, expect, it } from "vitest";

import {
  findCatalogMake,
  findCatalogModel,
  referenceQuery,
  VEHICLE_CATALOG,
} from "@/features/vehicles/catalog";
import { BODY_TYPES, VEHICLE_CATEGORIES } from "@/features/vehicles/schemas";

describe("vehicle make/model catalogue", () => {
  it("only uses known categories and body types, with sane seat counts", () => {
    for (const make of VEHICLE_CATALOG) {
      expect(make.models.length).toBeGreaterThan(0);
      for (const model of make.models) {
        expect(VEHICLE_CATEGORIES).toContain(model.category);
        expect(BODY_TYPES).toContain(model.bodyType);
        expect(model.seats).toBeGreaterThanOrEqual(1);
        expect(model.seats).toBeLessThanOrEqual(60);
      }
    }
  });

  it("has no duplicate makes or duplicate models within a make", () => {
    const makes = VEHICLE_CATALOG.map((m) => m.name.toLowerCase());
    expect(new Set(makes).size).toBe(makes.length);
    for (const make of VEHICLE_CATALOG) {
      const models = make.models.map((m) => m.name.toLowerCase());
      expect(new Set(models).size).toBe(models.length);
    }
  });

  it("finds makes and models regardless of case, spaces and hyphens", () => {
    expect(findCatalogMake("toyota")?.name).toBe("Toyota");
    expect(findCatalogMake("Mercedes Benz")?.name).toBe("Mercedes-Benz");
    expect(findCatalogModel("TOYOTA", "land cruiser prado")?.seats).toBe(7);
    expect(findCatalogModel("Hyundai", "H1")?.name).toBe("H-1");
    expect(findCatalogModel("Toyota", "Unknown")).toBeUndefined();
  });

  it("builds the photo search phrase from the curated title or make and model", () => {
    expect(referenceQuery("Hyundai", "H-1")).toBe("Hyundai Starex");
    expect(referenceQuery("toyota", "corolla")).toBe("Toyota Corolla");
    expect(referenceQuery("Geely", "Coolray")).toBe("Geely Coolray");
  });
});
