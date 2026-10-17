import { describe, expect, it } from "vitest";

import { trustedOrigins } from "@/server/auth/origins";

describe("trustedOrigins", () => {
  it("keeps the public URL and the configured extras, trimmed and without trailing slash", () => {
    expect(
      trustedOrigins({
        appUrl: "https://ridekmer.example/",
        extra: " https://admin.example , ,http://localhost:3000",
      }),
    ).toEqual(["https://ridekmer.example", "https://admin.example", "http://localhost:3000"]);
  });

  it("adds Vercel's deployment hosts with https and de-duplicates the production host", () => {
    expect(
      trustedOrigins({
        appUrl: "https://ridekmerw.vercel.app",
        vercel: {
          VERCEL_URL: "ridekmerw-abc123-wouapit999s-projects.vercel.app",
          VERCEL_BRANCH_URL: "ridekmerw-git-main-wouapit999s-projects.vercel.app",
          VERCEL_PROJECT_PRODUCTION_URL: "ridekmerw.vercel.app",
        },
      }),
    ).toEqual([
      "https://ridekmerw.vercel.app",
      "https://ridekmerw-abc123-wouapit999s-projects.vercel.app",
      "https://ridekmerw-git-main-wouapit999s-projects.vercel.app",
    ]);
  });

  it("ignores empty Vercel variables outside Vercel", () => {
    expect(trustedOrigins({ appUrl: "http://localhost:3000", vercel: {} })).toEqual([
      "http://localhost:3000",
    ]);
  });
});
