import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { findCatalogModel } from "@/features/vehicles/catalog";
import {
  isSamplePlate,
  samplePhotoUrl,
  SHOWCASE_VEHICLES,
} from "@/features/vehicles/showcase-data";

const dir = path.join(process.cwd(), "public/showcase");
const credits = JSON.parse(
  readFileSync(path.join(process.cwd(), "src/features/vehicles/showcase-credits.json"), "utf8"),
) as Array<{
  file: string;
  license: string;
  source: string;
}>;

describe("showcase sample data", () => {
  it("has 10 clearly fictional listings across several cities", () => {
    expect(SHOWCASE_VEHICLES).toHaveLength(10);
    expect(new Set(SHOWCASE_VEHICLES.map((v) => v.plate)).size).toBe(10);
    for (const v of SHOWCASE_VEHICLES) expect(v.plate.startsWith("EX-")).toBe(true);
    expect(new Set(SHOWCASE_VEHICLES.map((v) => v.city)).size).toBeGreaterThanOrEqual(4);
  });

  it("recognises sample plates and serves their photo", () => {
    expect(isSamplePlate("EX-101-DLA")).toBe(true);
    expect(isSamplePlate("ex-101-dla")).toBe(true);
    expect(isSamplePlate("LT 123 AB")).toBe(false);
    expect(samplePhotoUrl("EX-101-DLA")).toBe("/showcase/toyota-corolla.jpg");
    expect(samplePhotoUrl("LT 123 AB")).toBeNull();
  });

  it("uses makes and models from the owner form lists", () => {
    for (const v of SHOWCASE_VEHICLES)
      expect(findCatalogModel(v.make, v.model), v.model).toBeTruthy();
  });

  it("ships a free-licence photo with a credit for every listing", () => {
    for (const v of SHOWCASE_VEHICLES) {
      expect(existsSync(path.join(dir, v.photo)), v.photo).toBe(true);
      const credit = credits.find((c) => c.file === v.photo);
      expect(credit, v.photo).toBeTruthy();
      expect(credit!.license).toMatch(/^(CC|Public domain)/i);
      expect(credit!.source).toMatch(/^https:\/\/commons\.wikimedia\.org\//);
    }
  });
});
