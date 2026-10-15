import { describe, expect, it } from "vitest";

import {
  geofenceTransitions,
  isStationary,
  parseGeometry,
  parseRideKmerEvents,
  pointInGeometry,
  pointInPolygon,
  trackDistanceKm,
  GenericRestTrackingProvider,
  TrackingProviderError,
} from "@ridekmer/tracking";

const douala = { latitude: 4.0511, longitude: 9.7679 };

describe("geofence maths", () => {
  it("tests circles and polygons", () => {
    const circle = parseGeometry({ kind: "circle", center: douala, radiusMeters: 25_000 })!;
    expect(pointInGeometry({ latitude: 4.06, longitude: 9.78 }, circle)).toBe(true);
    expect(pointInGeometry({ latitude: 3.848, longitude: 11.5021 }, circle)).toBe(false);
    const square: Array<[number, number]> = [
      [4.0, 9.7],
      [4.1, 9.7],
      [4.1, 9.8],
      [4.0, 9.8],
    ];
    expect(pointInPolygon({ latitude: 4.05, longitude: 9.75 }, square)).toBe(true);
    expect(pointInPolygon({ latitude: 4.2, longitude: 9.75 }, square)).toBe(false);
    expect(parseGeometry({ kind: "polygon", ring: [[1, 2]] })).toBeNull();
    expect(parseGeometry({ kind: "circle", center: douala, radiusMeters: -1 })).toBeNull();
  });

  it("emits enter and exit transitions", () => {
    expect(geofenceTransitions(["a"], ["a", "b"])).toEqual([
      { geofenceId: "b", type: "GEOFENCE_ENTER" },
    ]);
    expect(geofenceTransitions(["a", "b"], ["b"])).toEqual([
      { geofenceId: "a", type: "GEOFENCE_EXIT" },
    ]);
    expect(geofenceTransitions([], [])).toEqual([]);
  });

  it("sums track distance and detects a stationary vehicle", () => {
    expect(
      trackDistanceKm([douala, { latitude: 4.0511, longitude: 9.8679 }, douala]),
    ).toBeGreaterThan(20);
    const now = new Date("2026-10-15T10:00:00Z");
    expect(
      isStationary(
        { recordedAt: new Date("2026-10-15T09:55:00Z"), speedKmh: 0, ignitionOn: false },
        now,
      ),
    ).toBe(true);
    expect(
      isStationary(
        { recordedAt: new Date("2026-10-15T09:55:00Z"), speedKmh: 30, ignitionOn: false },
        now,
      ),
    ).toBe(false);
    expect(
      isStationary(
        { recordedAt: new Date("2026-10-15T09:55:00Z"), speedKmh: 0, ignitionOn: true },
        now,
      ),
    ).toBe(false);
    expect(
      isStationary(
        { recordedAt: new Date("2026-10-15T09:00:00Z"), speedKmh: 0, ignitionOn: false },
        now,
      ),
    ).toBe(false);
    expect(isStationary(null, now)).toBe(false);
  });
});

describe("RideKmer push format and generic REST shell", () => {
  it("parses valid rows and rejects malformed ones", () => {
    const events = parseRideKmerEvents(
      JSON.stringify([
        {
          id: "e1",
          device: "d1",
          type: "LOCATION",
          at: "2026-10-15T10:00:00Z",
          lat: 4.05,
          lng: 9.77,
          speed: 12,
          ignition: true,
          battery: 80,
          power: "EXTERNAL",
        },
      ]),
    );
    expect(events[0]?.location?.batteryPercent).toBe(80);
    expect(() => parseRideKmerEvents("nope")).toThrow(TrackingProviderError);
    expect(() => parseRideKmerEvents("[]")).toThrow(/non-empty/);
    expect(() =>
      parseRideKmerEvents(
        JSON.stringify([{ id: "e", device: "d", type: "WARP", at: "2026-10-15T10:00:00Z" }]),
      ),
    ).toThrow(/Row 0/);
    expect(() =>
      parseRideKmerEvents(
        JSON.stringify([
          { id: "e", device: "d", type: "LOCATION", at: "2026-10-15T10:00:00Z", lat: 95, lng: 0 },
        ]),
      ),
    ).toThrow(/coordinate/);
  });

  it("refuses to build without configuration, verifies signatures and never pulls", async () => {
    expect(() => new GenericRestTrackingProvider({ environment: "sandbox" })).toThrow(
      /GPS_PROVIDER_BASE_URL/,
    );
    const p = new GenericRestTrackingProvider({
      environment: "sandbox",
      baseUrl: "https://gps.example.invalid",
      apiKey: "k",
      webhookSecret: "s",
    });
    const body = JSON.stringify([
      { id: "e1", device: "d1", type: "IGNITION_ON", at: "2026-10-15T10:00:00Z" },
    ]);
    expect((await p.processWebhook({ headers: {}, rawBody: body })).signatureValid).toBe(false);
    const ok = await p.processWebhook({
      headers: { "x-ridekmer-signature": `sha256=${p.sign(body)}` },
      rawBody: body,
    });
    expect(ok.signatureValid).toBe(true);
    expect(ok.events[0]?.type).toBe("IGNITION_ON");
    await expect(p.getLastLocation("d1")).rejects.toMatchObject({ code: "NOT_IMPLEMENTED" });
  });
});
