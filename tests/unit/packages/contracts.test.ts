import { describe, expect, it } from "vitest";

import { checksum, extractVariables, renderContract, verifyChecksum } from "@ridekmer/contracts";

describe("contract rendering", () => {
  const template =
    "# Rental {{reference}}\n\nCustomer: {{customerName}}\n{{#if chauffeur}}Chauffeur: {{chauffeurName}}{{/if}}\nDeposit: {{deposit}} XAF";

  it("substitutes variables and conditional blocks deterministically", () => {
    const a = renderContract(template, {
      reference: "RK-1",
      customerName: "Demo",
      chauffeur: false,
      deposit: 150000,
    });
    const b = renderContract(template, {
      reference: "RK-1",
      customerName: "Demo",
      chauffeur: false,
      deposit: 150000,
    });
    expect(a.markdown).toBe(b.markdown);
    expect(a.checksumSha256).toBe(b.checksumSha256);
    expect(a.markdown).not.toContain("Chauffeur:");
    expect(a.missingVariables).toEqual([]);
  });

  it("reports missing variables", () => {
    const r = renderContract(template, { reference: "RK-1", chauffeur: true });
    expect(r.missingVariables).toEqual(["chauffeurName", "customerName", "deposit"]);
  });

  it("extracts variables and verifies checksums", () => {
    expect(extractVariables(template)).toEqual([
      "chauffeur",
      "chauffeurName",
      "customerName",
      "deposit",
      "reference",
    ]);
    const content = "immutable";
    expect(verifyChecksum(content, checksum(content))).toBe(true);
    expect(verifyChecksum("changed", checksum(content))).toBe(false);
  });
});
