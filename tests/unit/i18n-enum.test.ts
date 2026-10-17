import { describe, expect, it } from "vitest";

import { enumLabel, humaniseCode, ledgerAccountLabel, type EnumTranslator } from "@/lib/i18n-enum";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
import { ROLE_DEFINITIONS } from "@/server/auth/permissions";
import { BODY_TYPES } from "@/features/vehicles/schemas";

function translator(messages: Record<string, unknown>): EnumTranslator {
  const lookup = (key: string): unknown =>
    key.split(".").reduce<unknown>((node, part) => {
      if (node && typeof node === "object") return (node as Record<string, unknown>)[part];
      return undefined;
    }, messages);
  const t = ((key: string) => {
    const value = lookup(key);
    if (typeof value !== "string") throw new Error(`MISSING_MESSAGE: ${key}`);
    return value;
  }) as EnumTranslator;
  t.has = (key: string) => typeof lookup(key) === "string";
  return t;
}

describe("enum labels", () => {
  const ten = translator(en.enums);
  const tfr = translator(fr.enums);

  it("translates known codes in both languages", () => {
    expect(enumLabel(ten, "bookingType", "CHAUFFEUR_DRIVEN")).toBe("With chauffeur");
    expect(enumLabel(tfr, "bookingType", "CHAUFFEUR_DRIVEN")).toBe("Avec chauffeur");
    expect(enumLabel(tfr, "role", "super_administrator")).toBe("Super-administrateur");
  });

  it("falls back to a readable label for unknown codes and a dash for empty ones", () => {
    expect(enumLabel(ten, "bookingType", "NEW_FUTURE_TYPE")).toBe("New future type");
    expect(enumLabel(ten, "missingGroup", "x")).toBe("X");
    expect(enumLabel(ten, "role", null)).toBe("—");
    expect(humaniseCode("platform_cash")).toBe("Platform cash");
  });

  it("labels ledger accounts with an owner suffix", () => {
    expect(ledgerAccountLabel(ten, "owner_payable:ck123")).toBe("Owed to owner");
    expect(ledgerAccountLabel(tfr, "platform_cash")).toBe("Trésorerie de la plateforme");
  });

  it("covers every role and body type", () => {
    for (const role of ROLE_DEFINITIONS) {
      expect(ten.has(`role.${role.key}`), role.key).toBe(true);
      expect(tfr.has(`role.${role.key}`), role.key).toBe(true);
    }
    for (const body of BODY_TYPES) {
      expect(ten.has(`bodyType.${body}`), body).toBe(true);
      expect(tfr.has(`bodyType.${body}`), body).toBe(true);
    }
  });
});
