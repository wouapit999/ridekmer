import { describe, expect, it } from "vitest";

import { buildContentSecurityPolicy, securityHeaders } from "@/server/security/headers";

describe("security headers", () => {
  it("sets a strict CSP and clickjacking protection", () => {
    const csp = buildContentSecurityPolicy();
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("default-src 'self'");
    const keys = securityHeaders().map((h) => h.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "Content-Security-Policy",
        "X-Frame-Options",
        "Strict-Transport-Security",
        "X-Content-Type-Options",
        "Referrer-Policy",
      ]),
    );
  });
});
