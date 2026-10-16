import { afterEach, describe, expect, it } from "vitest";

import { getEnv, resetEnvCache } from "@/lib/env";

const PRODUCTION_BASE = {
  NODE_ENV: "production",
  APP_ENV: "production",
  DATABASE_URL: "postgresql://user:pass@db.example.com:5432/ridekmer",
  BETTER_AUTH_SECRET: "x".repeat(40),
  APP_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  CRON_SECRET: "y".repeat(32),
  STORAGE_PROVIDER: "s3",
  S3_BUCKET: "b",
  S3_REGION: "r",
  S3_ACCESS_KEY_ID: "k",
  S3_SECRET_ACCESS_KEY: "s",
  UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "t",
} as const;

function withEnv(overrides: Record<string, string | undefined>) {
  const snapshot = { ...process.env };
  for (const key of Object.keys(PRODUCTION_BASE)) delete process.env[key];
  for (const key of ["STORAGE_LOCAL_ROOT", "RATE_LIMIT_BACKEND", "CRON_MODE"])
    delete process.env[key];
  Object.assign(process.env, PRODUCTION_BASE, overrides);
  for (const [k, v] of Object.entries(overrides)) if (v === undefined) delete process.env[k];
  resetEnvCache();
  return () => {
    process.env = snapshot;
    resetEnvCache();
  };
}

describe("production safety for single-server hosts (ADR-037)", () => {
  let restore: (() => void) | undefined;
  afterEach(() => restore?.());

  it("accepts a baseline production configuration", () => {
    restore = withEnv({});
    expect(getEnv().APP_ENV).toBe("production");
  });

  it("refuses local storage without a persistent volume, accepts it with one", () => {
    restore = withEnv({ STORAGE_PROVIDER: "local" });
    expect(() => getEnv()).toThrow(/STORAGE_LOCAL_ROOT/);
    restore();
    restore = withEnv({ STORAGE_PROVIDER: "local", STORAGE_LOCAL_ROOT: "/data" });
    expect(getEnv().STORAGE_LOCAL_ROOT).toBe("/data");
    restore();
    restore = withEnv({ STORAGE_PROVIDER: "local", STORAGE_LOCAL_ROOT: "relative/path" });
    expect(() => getEnv()).toThrow(/absolute path/);
  });

  it("requires Upstash unless the memory backend is chosen explicitly", () => {
    restore = withEnv({ UPSTASH_REDIS_REST_URL: undefined, UPSTASH_REDIS_REST_TOKEN: undefined });
    expect(() => getEnv()).toThrow(/Upstash/);
    restore();
    restore = withEnv({
      UPSTASH_REDIS_REST_URL: undefined,
      UPSTASH_REDIS_REST_TOKEN: undefined,
      RATE_LIMIT_BACKEND: "memory",
    });
    expect(getEnv().RATE_LIMIT_BACKEND).toBe("memory");
  });

  it("defaults to external cron and accepts in-process", () => {
    restore = withEnv({});
    expect(getEnv().CRON_MODE).toBe("external");
    restore();
    restore = withEnv({ CRON_MODE: "in-process" });
    expect(getEnv().CRON_MODE).toBe("in-process");
  });
});
