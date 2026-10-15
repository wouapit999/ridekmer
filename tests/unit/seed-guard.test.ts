import { describe, expect, it } from "vitest";

import { demoSeedAllowed } from "../../prisma/seed-data/guard";
import { DEMO_ACCOUNTS } from "../../prisma/seed-data/demo";

describe("demo seed guard", () => {
  it("never allows demo data in production, even when explicitly requested", () => {
    expect(demoSeedAllowed({ NODE_ENV: "production", ALLOW_DEMO_SEED: "true" })).toBe(false);
    expect(
      demoSeedAllowed({ NODE_ENV: "development", APP_ENV: "production", ALLOW_DEMO_SEED: "true" }),
    ).toBe(false);
  });

  it("requires explicit opt-in outside production", () => {
    expect(demoSeedAllowed({ NODE_ENV: "development" })).toBe(false);
    expect(demoSeedAllowed({ NODE_ENV: "development", ALLOW_DEMO_SEED: "true" })).toBe(true);
    expect(demoSeedAllowed({ NODE_ENV: "test", APP_ENV: "preview", ALLOW_DEMO_SEED: "true" })).toBe(
      true,
    );
  });

  it("uses clearly synthetic identities", () => {
    for (const account of DEMO_ACCOUNTS) {
      expect(account.email.endsWith("@ridekmer.test")).toBe(true);
      expect(account.phone.startsWith("+2376000000")).toBe(true);
      expect(account.name.startsWith("Demo ")).toBe(true);
    }
  });
});
