import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { SHOWCASE_VEHICLES } from "../../prisma/seed-data/showcase";
import { findCatalogModel } from "@/features/vehicles/catalog";

const dir = path.join(process.cwd(), "prisma/seed-data/showcase-photos");
const credits = JSON.parse(readFileSync(path.join(dir, "credits.json"), "utf8")) as Array<{
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
