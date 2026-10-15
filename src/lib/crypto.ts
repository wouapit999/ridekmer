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

/**
 * During a rotation the previous key stays readable (APP_ENCRYPTION_KEY_PREVIOUS +
 * APP_ENCRYPTION_KEY_PREVIOUS_ID) until `pnpm db:rotate-key` has re-encrypted every row.
 */
function loadPreviousKey(): { key: Buffer; id: string } | null {
  const raw = process.env.APP_ENCRYPTION_KEY_PREVIOUS;
  const id = process.env.APP_ENCRYPTION_KEY_PREVIOUS_ID;
  if (!raw || !id) return null;
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32)
    throw new Error("APP_ENCRYPTION_KEY_PREVIOUS must decode to exactly 32 bytes");
  return { key, id };
}

function keyFor(keyId: string): Buffer {
  const active = loadKey();
  if (keyId === active.id) return active.key;
  const previous = loadPreviousKey();
  if (previous && keyId === previous.id) return previous.key;
  throw new Error(
    `Encrypted with key ${keyId}, but active key is ${active.id}; rotate before decrypting`,
  );
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
  const [keyId, ivB64, tagB64, dataB64] = payload.split(":");
  if (!keyId || !ivB64 || !tagB64 || !dataB64) throw new Error("Malformed encrypted payload");
  const key = keyFor(keyId);
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

/** Key id embedded in an encrypted payload. */
export function encryptedKeyId(payload: string): string {
  return payload.split(":")[0] ?? "";
}

/** Re-encrypt a payload with the active key; returns it unchanged when already current. */
export function reencryptField(payload: string): string {
  if (encryptedKeyId(payload) === loadKey().id) return payload;
  return encryptField(decryptField(payload));
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
