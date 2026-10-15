import { describe, expect, it } from "vitest";

import { MockTrackingProvider, haversineKm } from "@ridekmer/tracking";

describe("tracking provider (mock)", () => {
  it("computes distances", () => {
    const douala = { latitude: 4.0511, longitude: 9.7679 };
    const yaounde = { latitude: 3.848, longitude: 11.5021 };
    expect(Math.round(haversineKm(douala, yaounde))).toBeGreaterThan(180);
    expect(Math.round(haversineKm(douala, yaounde))).toBeLessThan(200);
  });

  it("rejects unsigned webhooks and parses signed ones", async () => {
    const p = new MockTrackingProvider("secret");
    p.registerDevice("dev-1");
    const body = JSON.stringify([
      {
        id: "e1",
        device: "dev-1",
        type: "LOCATION",
        at: "2026-10-15T10:00:00Z",
        lat: 4.05,
        lng: 9.77,
        speed: 20,
      },
    ]);
    const bad = await p.processWebhook({ headers: {}, rawBody: body });
    expect(bad.signatureValid).toBe(false);
    expect(bad.events).toHaveLength(0);
    const good = await p.processWebhook({
      headers: { "x-mock-gps-signature": p.sign(body) },
      rawBody: body,
    });
    expect(good.signatureValid).toBe(true);
    expect(good.events[0]?.location?.latitude).toBe(4.05);
  });
});
