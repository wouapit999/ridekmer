import { describe, expect, it } from "vitest";

import { escapeCsvCell, toCsv } from "@/lib/csv";

describe("csv export hardening", () => {
  it("neutralises spreadsheet formula injection", () => {
    expect(escapeCsvCell("=1+1")).toBe("'=1+1");
    expect(escapeCsvCell("+237677")).toBe("'+237677");
    expect(escapeCsvCell("-5")).toBe("'-5");
    expect(escapeCsvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(escapeCsvCell("\tcmd")).toBe("'\tcmd");
  });

  it("quotes separators and quotes", () => {
    expect(escapeCsvCell("a,b")).toBe('"a,b"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
  });

  it("builds a CSV with a header row", () => {
    const csv = toCsv([
      { ref: "RK-1", total: 35000 },
      { ref: "=HACK", total: 0 },
    ]);
    expect(csv.split("\r\n")).toEqual(["ref,total", "RK-1,35000", "'=HACK,0"]);
  });
});
