import { beforeEach, describe, expect, it } from "vitest";

import {
  checkRateLimit,
  consumeInMemory,
  enforceRateLimit,
  RATE_LIMIT_RULES,
  RateLimitedError,
  resetRateLimitMemory,
} from "@/server/security/rate-limit";

describe("rate limiter (in-memory fallback)", () => {
  beforeEach(() => resetRateLimitMemory());

  it("allows up to the limit inside a window and blocks afterwards", () => {
    const rule = { limit: 3, windowSeconds: 60 };
    const t0 = 1_000_000;
    expect(consumeInMemory("k", rule, t0).allowed).toBe(true);
    expect(consumeInMemory("k", rule, t0 + 1).allowed).toBe(true);
    expect(consumeInMemory("k", rule, t0 + 2)).toMatchObject({ allowed: true, remaining: 0 });
    const blocked = consumeInMemory("k", rule, t0 + 3);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("resets after the window elapses", () => {
    const rule = { limit: 1, windowSeconds: 10 };
    expect(consumeInMemory("k", rule, 0).allowed).toBe(true);
    expect(consumeInMemory("k", rule, 5_000).allowed).toBe(false);
    expect(consumeInMemory("k", rule, 10_001).allowed).toBe(true);
  });

  it("keys are independent per subject", () => {
    const rule = { limit: 1, windowSeconds: 10 };
    expect(consumeInMemory("a", rule, 0).allowed).toBe(true);
    expect(consumeInMemory("b", rule, 0).allowed).toBe(true);
    expect(consumeInMemory("a", rule, 1).allowed).toBe(false);
  });

  it("enforceRateLimit throws a 429-style error once the rule is exhausted", async () => {
    const subject = `user-${Date.now()}`;
    for (let i = 0; i < RATE_LIMIT_RULES["privacy.export"].limit; i += 1) {
      await enforceRateLimit("privacy.export", subject);
    }
    await expect(enforceRateLimit("privacy.export", subject)).rejects.toBeInstanceOf(
      RateLimitedError,
    );
    const result = await checkRateLimit("privacy.export", subject);
    expect(result.allowed).toBe(false);
  });

  it("every rule has a positive limit and window", () => {
    for (const rule of Object.values(RATE_LIMIT_RULES)) {
      expect(rule.limit).toBeGreaterThan(0);
      expect(rule.windowSeconds).toBeGreaterThan(0);
    }
  });
});
