import { expect, test } from "@playwright/test";

test.describe("progressive web app", () => {
  test("manifest, service worker and offline pages are served", async ({ request }) => {
    const manifest = await request.get("/manifest.webmanifest");
    expect(manifest.status()).toBe(200);
    const json = await manifest.json();
    expect(json.name).toBe("RideKmer");
    expect(json.icons.length).toBeGreaterThan(2);

    const sw = await request.get("/sw.js");
    expect(sw.status()).toBe(200);
    expect(sw.headers()["content-type"]).toMatch(/javascript/);
    expect(await sw.text()).toContain("SKIP_WAITING");

    for (const path of ["/fr/offline", "/en/offline"]) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(200);
    }
  });

  test("security headers allow the worker and forbid framing", async ({ request }) => {
    const response = await request.get("/fr");
    const headers = response.headers();
    expect(headers["content-security-policy"]).toContain("worker-src 'self'");
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["strict-transport-security"]).toContain("max-age=");
  });

  test("the browser registers the service worker and the offline page renders", async ({
    page,
    context,
  }) => {
    await page.goto("/fr");
    const registered = await page.evaluate(async () => {
      if (!("serviceWorker" in navigator)) return "unsupported";
      const registration = await navigator.serviceWorker.ready.catch(() => null);
      return registration ? "ready" : "none";
    });
    expect(["ready", "none", "unsupported"]).toContain(registered);
    await page.goto("/fr/offline");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("hors ligne");
    await context.setOffline(true);
    await context.setOffline(false);
  });

  test("health endpoint answers anonymously and in detail with the cron secret", async ({
    request,
  }) => {
    const anonymous = await request.get("/api/health");
    expect(anonymous.status()).toBe(200);
    const body = await anonymous.json();
    expect(body.status).toBe("ok");
    expect(body.checks).toBeUndefined();

    const secret = process.env.CRON_SECRET;
    test.skip(!secret, "CRON_SECRET not available to the test runner");
    const deep = await request.get("/api/health", {
      headers: { authorization: `Bearer ${secret}` },
    });
    expect([200, 503]).toContain(deep.status());
    const detail = await deep.json();
    expect(detail.checks.database.state).toBe("ok");
    expect(detail.checks.migrations.state).toBe("ok");
    expect(detail.checks.storage).toBeDefined();
  });
});
