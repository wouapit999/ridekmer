import { describe, expect, it } from "vitest";

import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

function flatten(obj: unknown, prefix = ""): string[] {
  if (Array.isArray(obj)) return [`${prefix}[${obj.length}]`];
  if (obj && typeof obj === "object") {
    return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
      flatten(v, prefix ? `${prefix}.${k}` : k),
    );
  }
  return [prefix];
}

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)[,}]/g)].map((m) => m[1]!).sort();
}

function leaves(obj: unknown, prefix = ""): Array<[string, string]> {
  if (Array.isArray(obj)) return obj.flatMap((v, i) => leaves(v, `${prefix}[${i}]`));
  if (obj && typeof obj === "object") {
    return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
      leaves(v, prefix ? `${prefix}.${k}` : k),
    );
  }
  return [[prefix, String(obj)]];
}

describe("translation catalogues", () => {
  it("have identical key structure in English and French", () => {
    expect(flatten(fr).sort()).toEqual(flatten(en).sort());
  });

  it("use the same ICU placeholders in both languages", () => {
    const enLeaves = new Map(leaves(en));
    for (const [key, frText] of leaves(fr)) {
      const enText = enLeaves.get(key);
      if (enText === undefined) continue;
      expect(placeholders(frText), key).toEqual(placeholders(enText));
    }
  });

  it("never contain empty strings", () => {
    for (const [key, value] of [...leaves(en), ...leaves(fr)]) {
      expect(value.trim().length, key).toBeGreaterThan(0);
    }
  });

  it("show the brand name as RideKmer", () => {
    expect(en.common.appName).toBe("RideKmer");
    expect(fr.common.appName).toBe("RideKmer");
  });
});
