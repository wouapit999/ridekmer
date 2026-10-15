import { describe, expect, it } from "vitest";

import { addXaf, applyBps, assertXaf, formatXaf, percentToBps } from "@/lib/money";

describe("money", () => {
  it("rejects non-integer amounts", () => {
    expect(() => assertXaf(10.5)).toThrow(TypeError);
    expect(() => assertXaf(Number.NaN)).toThrow(TypeError);
    expect(() => assertXaf("10")).toThrow(TypeError);
  });

  it("adds integer amounts", () => {
    expect(addXaf(35000, 15000, 500)).toBe(50500);
  });

  it("applies basis points with half-up rounding and no floating point drift", () => {
    expect(applyBps(35000, 2000)).toBe(7000); // 20 %
    expect(applyBps(33333, 1500)).toBe(5000); // 4999.95 → 5000
    expect(applyBps(1, 5000)).toBe(1); // 0.5 → 1
    expect(applyBps(-10000, 2500)).toBe(-2500);
    expect(Number.isInteger(applyBps(123457, 3333))).toBe(true);
  });

  it("converts percentages to basis points", () => {
    expect(percentToBps(20)).toBe(2000);
    expect(percentToBps(2.5)).toBe(250);
  });

  it("formats XAF without decimals in both locales", () => {
    expect(formatXaf(35000, "fr")).toMatch(/35 000/);
    expect(formatXaf(35000, "fr")).toContain("XAF");
    expect(formatXaf(1250000, "en")).toMatch(/1,250,000/);
  });
});
