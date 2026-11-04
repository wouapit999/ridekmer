import { afterEach, describe, expect, it, vi } from "vitest";

import {
  festiveBootScript,
  festiveMode,
  festiveYear,
  isFestiveSeason,
} from "@/features/home/festive";

/** Runs the inline boot script against a fake <html> and storage; returns the attributes set. */
function boot(now: string, mode: "auto" | "on" | "off", stored: Record<string, string> = {}) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(now));
  const attrs: Record<string, string> = {};
  const documentElement = { setAttribute: (k: string, v: string) => (attrs[k] = v) };
  const localStorage = { getItem: (k: string) => stored[k] ?? null };
  new Function("document", "localStorage", festiveBootScript(mode))(
    { documentElement },
    localStorage,
  );
  return attrs;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("festive season", () => {
  it("runs from 1 November to 15 January, Douala time", () => {
    expect(isFestiveSeason(new Date("2026-10-31T22:30:00Z"), "auto")).toBe(false);
    expect(isFestiveSeason(new Date("2026-10-31T23:30:00Z"), "auto")).toBe(true); // 00:30 in Douala
    expect(isFestiveSeason(new Date("2026-12-25T12:00:00Z"), "auto")).toBe(true);
    expect(isFestiveSeason(new Date("2027-01-15T22:00:00Z"), "auto")).toBe(true);
    expect(isFestiveSeason(new Date("2027-01-15T23:30:00Z"), "auto")).toBe(false);
    expect(isFestiveSeason(new Date("2027-06-01T12:00:00Z"), "auto")).toBe(false);
  });

  it("can be forced on or off", () => {
    expect(isFestiveSeason(new Date("2027-06-01T12:00:00Z"), "on")).toBe(true);
    expect(isFestiveSeason(new Date("2026-12-25T12:00:00Z"), "off")).toBe(false);
    expect(festiveMode("on")).toBe("on");
    expect(festiveMode("nonsense")).toBe("auto");
    expect(festiveMode(undefined)).toBe("auto");
  });

  it("counts January visits as the previous year's holidays", () => {
    expect(festiveYear(new Date("2026-12-20T12:00:00Z"))).toBe(2026);
    expect(festiveYear(new Date("2027-01-05T12:00:00Z"))).toBe(2026);
  });

  it("boot script marks the page exactly when isFestiveSeason says so", () => {
    for (const now of ["2026-10-31T22:30:00Z", "2026-10-31T23:30:00Z", "2027-01-15T23:30:00Z"]) {
      expect("data-festive" in boot(now, "auto")).toBe(isFestiveSeason(new Date(now), "auto"));
    }
    expect(boot("2026-12-24T10:00:00Z", "auto")).toEqual({
      "data-festive": "",
      "data-festive-year": "2026",
    });
    expect(boot("2027-06-01T10:00:00Z", "on")["data-festive"]).toBe("");
    expect(boot("2026-12-24T10:00:00Z", "off")).toEqual({});
  });

  it("boot script keeps the ribbon closed once dismissed this season", () => {
    const attrs = boot("2027-01-03T10:00:00Z", "auto", { "ridekmer:festive-ribbon:2026": "1" });
    expect(attrs["data-festive-ribbon-off"]).toBe("");
  });
});
