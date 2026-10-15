import { beforeEach, describe, expect, it } from "vitest";

import { resetEnvCache } from "@/lib/env";
import {
  buildRealProvider,
  mergeProviderSettings,
  validateProviderSettings,
  type ResolvedProviderSettings,
} from "@/features/payments/provider-config";

const fromEnv: ResolvedProviderSettings = {
  provider: "MTN_MOMO",
  enabled: true,
  environment: "mock",
  baseUrl: undefined,
  credentials: { MTN_MOMO_WEBHOOK_SECRET: "env-secret" },
  source: "environment",
};

beforeEach(() => {
  resetEnvCache();
  Object.assign(process.env, { NODE_ENV: "test" });
  process.env.APP_ENV = "development";
});

describe("payment provider configuration merge", () => {
  it("falls back to the environment when no admin row exists", () => {
    const merged = mergeProviderSettings("MTN_MOMO", null, fromEnv);
    expect(merged.source).toBe("environment");
    expect(merged.environment).toBe("mock");
  });

  it("lets the admin row win for environment and base URL, merging credentials by field", () => {
    const merged = mergeProviderSettings(
      "MTN_MOMO",
      {
        enabled: true,
        environment: "sandbox",
        baseUrl: "https://sandbox.example.invalid",
        cardProviderId: null,
        credentials: {
          MTN_MOMO_SUBSCRIPTION_KEY: "db-key",
          MTN_MOMO_API_USER: "u",
          MTN_MOMO_API_KEY: "k",
        },
        updatedAt: new Date(),
      },
      fromEnv,
    );
    expect(merged.source).toBe("database");
    expect(merged.environment).toBe("sandbox");
    expect(merged.credentials.MTN_MOMO_SUBSCRIPTION_KEY).toBe("db-key");
    // The webhook secret still comes from the environment variable.
    expect(merged.credentials.MTN_MOMO_WEBHOOK_SECRET).toBe("env-secret");
    expect(validateProviderSettings(merged)).toMatchObject({ ok: true, code: "OK_SHELL" });
    expect(buildRealProvider(merged).environment).toBe("sandbox");
  });

  it("reports incomplete real configurations and disabled providers", () => {
    const incomplete = mergeProviderSettings(
      "ORANGE_MONEY",
      {
        enabled: true,
        environment: "production",
        baseUrl: null,
        cardProviderId: null,
        credentials: {},
        updatedAt: new Date(),
      },
      { ...fromEnv, provider: "ORANGE_MONEY", credentials: {} },
    );
    const outcome = validateProviderSettings(incomplete);
    expect(outcome.code).toBe("NOT_CONFIGURED");
    expect(outcome.detail).toMatch(/ORANGE_MONEY_CLIENT_ID/);
    expect(outcome.detail).toMatch(/baseUrl/);
    expect(validateProviderSettings({ ...incomplete, enabled: false }).code).toBe("DISABLED");
  });

  it("refuses a mock provider in production", () => {
    Object.assign(process.env, { NODE_ENV: "production" });
    process.env.APP_ENV = "production";
    process.env.STORAGE_PROVIDER = "vercel-blob";
    process.env.DATABASE_URL = "postgres://db.example.invalid/ridekmer";
    process.env.UPSTASH_REDIS_REST_URL = "https://upstash.example.invalid";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token";
    resetEnvCache();
    expect(validateProviderSettings(fromEnv).code).toBe("MOCK_IN_PRODUCTION");
  });
});
