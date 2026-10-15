import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The service worker is plain JavaScript outside the TypeScript build. These checks keep
 * its safety properties (no caching of private routes, offline fallback precached) visible.
 */
const source = readFileSync(path.resolve(__dirname, "../../public/sw.js"), "utf8");

describe("service worker source", () => {
  it("never caches API, account, owner or admin routes", () => {
    expect(source).toMatch(/NEVER_CACHE\s*=\s*\[/);
    expect(source).toContain("/^\\/api\\//");
    expect(source).toMatch(/account\|owner\|admin/);
  });

  it("precaches both offline pages and handles SKIP_WAITING", () => {
    expect(source).toContain('"/fr/offline"');
    expect(source).toContain('"/en/offline"');
    expect(source).toContain("SKIP_WAITING");
    expect(source).toContain("self.skipWaiting()");
  });

  it("only handles same-origin GET requests", () => {
    expect(source).toContain('if (request.method !== "GET") return;');
    expect(source).toContain("if (url.origin !== self.location.origin) return;");
  });
});
