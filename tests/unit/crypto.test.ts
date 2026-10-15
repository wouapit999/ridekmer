import { describe, expect, it } from "vitest";

import { decryptField, encryptField, hashForLookup, safeEqual, sha256Hex } from "@/lib/crypto";

describe("field encryption", () => {
  it("round-trips and uses a fresh IV each time", () => {
    const a = encryptField("CM-ID-123456");
    const b = encryptField("CM-ID-123456");
    expect(a).not.toBe(b);
    expect(decryptField(a)).toBe("CM-ID-123456");
    expect(a.startsWith("v1:")).toBe(true);
  });

  it("detects tampering", () => {
    const enc = encryptField("secret");
    const parts = enc.split(":");
    parts[3] = Buffer.from(
      "xx" + Buffer.from(parts[3]!, "base64").toString("binary").slice(2),
      "binary",
    ).toString("base64");
    expect(() => decryptField(parts.join(":"))).toThrow();
  });

  it("produces deterministic, case-insensitive lookup hashes", () => {
    expect(hashForLookup(" abc123 ")).toBe(hashForLookup("ABC123"));
    expect(hashForLookup("abc123")).not.toBe(hashForLookup("abc124"));
  });

  it("hashes content and compares safely", () => {
    expect(sha256Hex("hello")).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
    expect(safeEqual("a", "a")).toBe(true);
    expect(safeEqual("a", "b")).toBe(false);
    expect(safeEqual("a", "ab")).toBe(false);
  });
});
