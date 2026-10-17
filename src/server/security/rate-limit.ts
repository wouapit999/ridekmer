import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { headers } from "next/headers";

import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Application-level rate limiting for sensitive operations that are not covered by Better
 * Auth's own limiter (contact form, payment initiation, data-privacy requests, exports).
 *
 * - Production: Upstash Redis sliding window (shared across serverless instances).
 * - Development / tests: an in-memory fixed window per process. Not safe for production and
 *   `getEnv()` refuses to start production without Upstash.
 *
 * Keys are scoped per action and per subject (user id when known, otherwise client IP). The
 * limits are deliberately generous: many Cameroonian users share carrier-grade NAT addresses.
 */
export interface RateLimitRule {
  /** Maximum number of calls in the window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
}

export const RATE_LIMIT_RULES = {
  "contact.submit": { limit: 5, windowSeconds: 600 },
  "payment.initiate": { limit: 10, windowSeconds: 600 },
  "payment.refresh": { limit: 60, windowSeconds: 600 },
  "privacy.export": { limit: 3, windowSeconds: 3600 },
  "privacy.deletion": { limit: 3, windowSeconds: 3600 },
  "booking.create": { limit: 20, windowSeconds: 3600 },
  "incident.report": { limit: 10, windowSeconds: 3600 },
  "webhook.ingest": { limit: 600, windowSeconds: 60 },
  "vehicle.referenceImage": { limit: 60, windowSeconds: 600 },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitAction = keyof typeof RATE_LIMIT_RULES;

export class RateLimitedError extends Error {
  readonly status = 429;
  constructor(
    readonly action: RateLimitAction,
    readonly retryAfterSeconds: number,
  ) {
    super(`Rate limit exceeded for ${action}`);
    this.name = "RateLimitedError";
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

interface Window {
  count: number;
  resetAt: number;
}

const memory = new Map<string, Window>();
let redisLimiters: Map<string, Ratelimit> | undefined;

function upstash(): Redis | null {
  const env = getEnv();
  if (env.RATE_LIMIT_BACKEND === "memory") return null;
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) return null;
  return new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN });
}

function limiterFor(action: RateLimitAction): Ratelimit | null {
  const redis = upstash();
  if (!redis) return null;
  redisLimiters ??= new Map();
  let limiter = redisLimiters.get(action);
  if (!limiter) {
    const rule = RATE_LIMIT_RULES[action];
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(rule.limit, `${rule.windowSeconds} s`),
      prefix: `ridekmer:rl:${action}`,
    });
    redisLimiters.set(action, limiter);
  }
  return limiter;
}

/** Pure in-memory fixed window; exported for unit tests. */
export function consumeInMemory(
  key: string,
  rule: RateLimitRule,
  now = Date.now(),
): RateLimitResult {
  const windowMs = rule.windowSeconds * 1000;
  const existing = memory.get(key);
  if (!existing || existing.resetAt <= now) {
    memory.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: rule.limit - 1, retryAfterSeconds: 0 };
  }
  if (existing.count >= rule.limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }
  existing.count += 1;
  return { allowed: true, remaining: rule.limit - existing.count, retryAfterSeconds: 0 };
}

/** Tests only. */
export function resetRateLimitMemory() {
  memory.clear();
}

/** Opportunistic cleanup so a long-lived process does not grow without bound. */
function sweepMemory(now: number) {
  if (memory.size < 5000) return;
  for (const [key, window] of memory) if (window.resetAt <= now) memory.delete(key);
}

/** Client IP from the request headers (works outside a request scope by returning "local"). */
export async function clientAddress(): Promise<string> {
  try {
    const h = await headers();
    const forwarded = h.get("x-forwarded-for");
    return forwarded?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  } catch {
    return "local";
  }
}

/**
 * Check and consume one unit for `action` on behalf of `subject`. Never throws on
 * infrastructure errors: a Redis outage fails open and is logged, so a cache incident does
 * not take the booking flow down.
 */
export async function checkRateLimit(
  action: RateLimitAction,
  subject?: string | null,
): Promise<RateLimitResult> {
  const rule = RATE_LIMIT_RULES[action];
  const id = subject ?? (await clientAddress());
  const key = `${action}:${id}`;
  const limiter = limiterFor(action);
  if (limiter) {
    try {
      const result = await limiter.limit(id);
      return {
        allowed: result.success,
        remaining: result.remaining,
        retryAfterSeconds: result.success
          ? 0
          : Math.max(1, Math.ceil((result.reset - Date.now()) / 1000)),
      };
    } catch (error) {
      logger.error("rate_limit.redis_unavailable", { action, error });
      return { allowed: true, remaining: rule.limit, retryAfterSeconds: 0 };
    }
  }
  const now = Date.now();
  sweepMemory(now);
  return consumeInMemory(key, rule, now);
}

/** Throws `RateLimitedError` when the limit is exceeded; use in actions and route handlers. */
export async function enforceRateLimit(
  action: RateLimitAction,
  subject?: string | null,
): Promise<void> {
  const result = await checkRateLimit(action, subject);
  if (!result.allowed) {
    logger.warn("rate_limit.exceeded", { action, retryAfterSeconds: result.retryAfterSeconds });
    throw new RateLimitedError(action, result.retryAfterSeconds);
  }
}
