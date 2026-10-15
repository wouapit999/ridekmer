import { afterEach, describe, expect, it } from "vitest";

import { decryptField, encryptField, reencryptField } from "@/lib/crypto";

const KEY_A = Buffer.alloc(32, 1).toString("base64");
const KEY_B = Buffer.alloc(32, 2).toString("base64");

describe("encryption key rotation", () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env.APP_ENCRYPTION_KEY = original.APP_ENCRYPTION_KEY;
    process.env.APP_ENCRYPTION_KEY_ID = original.APP_ENCRYPTION_KEY_ID;
    delete process.env.APP_ENCRYPTION_KEY_PREVIOUS;
    delete process.env.APP_ENCRYPTION_KEY_PREVIOUS_ID;
  });

  it("decrypts values written with the previous key and re-encrypts them with the active one", () => {
    process.env.APP_ENCRYPTION_KEY = KEY_A;
    process.env.APP_ENCRYPTION_KEY_ID = "v1";
    const legacy = encryptField("CM-123456");
    expect(legacy.startsWith("v1:")).toBe(true);

    process.env.APP_ENCRYPTION_KEY = KEY_B;
    process.env.APP_ENCRYPTION_KEY_ID = "v2";
    process.env.APP_ENCRYPTION_KEY_PREVIOUS = KEY_A;
    process.env.APP_ENCRYPTION_KEY_PREVIOUS_ID = "v1";

    expect(decryptField(legacy)).toBe("CM-123456");
    const rotated = reencryptField(legacy);
    expect(rotated.startsWith("v2:")).toBe(true);
    expect(decryptField(rotated)).toBe("CM-123456");
    // Already-current payloads are returned unchanged.
    expect(reencryptField(rotated)).toBe(rotated);
  });

  it("refuses payloads from an unknown key id", () => {
    process.env.APP_ENCRYPTION_KEY = KEY_A;
    process.env.APP_ENCRYPTION_KEY_ID = "v1";
    const legacy = encryptField("x");
    process.env.APP_ENCRYPTION_KEY_ID = "v3";
    expect(() => decryptField(legacy)).toThrow(/rotate/);
  });
});
