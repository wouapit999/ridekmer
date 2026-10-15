import { afterEach, describe, expect, it } from "vitest";

import { getEnv, resetEnvCache } from "@/lib/env";

const saved = { ...process.env };

afterEach(() => {
  process.env = { ...saved };
  resetEnvCache();
});

describe("environment validation", () => {
  it("parses the test environment with defaults", () => {
    const env = getEnv();
    expect(env.APP_TIMEZONE).toBe("Africa/Douala");
    expect(env.APP_CURRENCY).toBe("XAF");
    expect(env.MTN_MOMO_ENVIRONMENT).toBe("mock");
  });

  it("reports every missing variable at once", () => {
    delete process.env.BETTER_AUTH_SECRET;
    delete process.env.CRON_SECRET;
    resetEnvCache();
    expect(() => getEnv()).toThrow(/BETTER_AUTH_SECRET[\s\S]*CRON_SECRET/);
  });

  it("refuses unsafe production configuration", () => {
    Object.assign(process.env, {
      NODE_ENV: "production",
      APP_ENV: "production",
      STORAGE_PROVIDER: "local",
      ALLOW_DEMO_SEED: "true",
    });
    resetEnvCache();
    expect(() => getEnv()).toThrow(
      /STORAGE_PROVIDER=local[\s\S]*ALLOW_DEMO_SEED[\s\S]*localhost[\s\S]*Upstash/,
    );
  });
});
