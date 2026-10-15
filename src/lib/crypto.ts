import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

/**
 * Field-level encryption for especially sensitive columns (identity numbers, VIN, bank
 * accounts). AES-256-GCM with a per-value random IV; the key id is embedded so keys can be
 * rotated. Lookups use a keyed HMAC so plaintext never needs to be decrypted for matching.
 */
const ALGORITHM = "aes-256-gcm";

function loadKey(): { key: Buffer; id: string } {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) throw new Error("APP_ENCRYPTION_KEY is not configured");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("APP_ENCRYPTION_KEY must decode to exactly 32 bytes");
  return { key, id: process.env.APP_ENCRYPTION_KEY_ID ?? "v1" };
}

export function encryptField(plaintext: string): string {
  const { key, id } = loadKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [id, iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(
    ":",
  );
}

export function decryptField(payload: string): string {
  const { key, id } = loadKey();
  const [keyId, ivB64, tagB64, dataB64] = payload.split(":");
  if (!keyId || !ivB64 || !tagB64 || !dataB64) throw new Error("Malformed encrypted payload");
  if (keyId !== id) {
    throw new Error(
      `Encrypted with key ${keyId}, but active key is ${id}; rotate before decrypting`,
    );
  }
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

/** Deterministic keyed hash for equality lookups on encrypted fields. */
export function hashForLookup(value: string): string {
  const { key } = loadKey();
  return createHmac("sha256", key).update(value.trim().toUpperCase()).digest("hex");
}

export function sha256Hex(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
