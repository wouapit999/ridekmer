import { createHmac, timingSafeEqual } from "node:crypto";

/** Constant-time HMAC-SHA256 signature check over the raw body. */
export function verifyHmacSignature(
  rawBody: string,
  secret: string,
  providedSignature: string | undefined,
): boolean {
  if (!providedSignature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const provided = providedSignature
    .replace(/^sha256=/, "")
    .trim()
    .toLowerCase();
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}

export function signPayload(rawBody: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
}

/**
 * Replay guard: rejects events older than the window or whose id has already been seen.
 * `seen` is a persistence hook (PaymentWebhookEvent table in the app, a Set in tests).
 */
export interface ReplayStore {
  hasSeen(eventId: string): Promise<boolean>;
  markSeen(eventId: string): Promise<void>;
}

export class MemoryReplayStore implements ReplayStore {
  private readonly ids = new Set<string>();
  async hasSeen(eventId: string) {
    return this.ids.has(eventId);
  }
  async markSeen(eventId: string) {
    this.ids.add(eventId);
  }
}

export async function guardReplay(
  store: ReplayStore,
  eventId: string,
  occurredAt: Date | undefined,
  windowSeconds: number,
  now: Date = new Date(),
): Promise<{ ok: true } | { ok: false; reason: "DUPLICATE" | "STALE" }> {
  if (occurredAt && Math.abs(now.getTime() - occurredAt.getTime()) > windowSeconds * 1000) {
    return { ok: false, reason: "STALE" };
  }
  if (await store.hasSeen(eventId)) return { ok: false, reason: "DUPLICATE" };
  await store.markSeen(eventId);
  return { ok: true };
}
