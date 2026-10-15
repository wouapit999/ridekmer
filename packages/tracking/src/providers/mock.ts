import { createHmac, timingSafeEqual } from "node:crypto";

import type {
  DeviceInfo,
  DeviceLocation,
  TrackingProvider,
  TrackingWebhookEvent,
  TrackingWebhookRequest,
  TripSummary,
} from "../types";

/** DEVELOPMENT MOCK telematics provider with deterministic synthetic positions around Douala. */
export class MockTrackingProvider implements TrackingProvider {
  readonly id = "mock-gps";
  readonly environment = "mock" as const;
  private readonly devices = new Map<string, DeviceLocation[]>();

  constructor(private readonly webhookSecret = "mock-gps-secret") {}

  registerDevice(
    externalDeviceId: string,
    seed: { latitude: number; longitude: number } = { latitude: 4.0511, longitude: 9.7679 },
  ) {
    this.devices.set(externalDeviceId, [
      {
        deviceId: externalDeviceId,
        recordedAt: new Date(),
        ...seed,
        speedKmh: 0,
        ignitionOn: false,
        powerStatus: "EXTERNAL",
      },
    ]);
  }

  pushLocation(location: DeviceLocation) {
    const list = this.devices.get(location.deviceId) ?? [];
    list.push(location);
    this.devices.set(location.deviceId, list);
  }

  async listDevices(): Promise<DeviceInfo[]> {
    return [...this.devices.entries()].map(([id, locs]) => ({
      externalDeviceId: id,
      online: true,
      lastSeenAt: locs.at(-1)?.recordedAt,
      model: "MOCK-GPS-1",
    }));
  }

  async getDevice(externalDeviceId: string): Promise<DeviceInfo | null> {
    const locs = this.devices.get(externalDeviceId);
    return locs
      ? { externalDeviceId, online: true, lastSeenAt: locs.at(-1)?.recordedAt, model: "MOCK-GPS-1" }
      : null;
  }

  async getLastLocation(externalDeviceId: string): Promise<DeviceLocation | null> {
    return this.devices.get(externalDeviceId)?.at(-1) ?? null;
  }

  async getLocationHistory(
    externalDeviceId: string,
    from: Date,
    to: Date,
  ): Promise<DeviceLocation[]> {
    return (this.devices.get(externalDeviceId) ?? []).filter(
      (l) => l.recordedAt >= from && l.recordedAt <= to,
    );
  }

  async getTrips(externalDeviceId: string, from: Date, to: Date): Promise<TripSummary[]> {
    const history = await this.getLocationHistory(externalDeviceId, from, to);
    if (history.length < 2) return [];
    const first = history[0]!;
    const last = history.at(-1)!;
    return [
      {
        startAt: first.recordedAt,
        endAt: last.recordedAt,
        distanceKm: Math.round(haversineKm(first, last) * 10) / 10,
        startLocation: { latitude: first.latitude, longitude: first.longitude },
        endLocation: { latitude: last.latitude, longitude: last.longitude },
      },
    ];
  }

  sign(rawBody: string): string {
    return createHmac("sha256", this.webhookSecret).update(rawBody).digest("hex");
  }

  async processWebhook(request: TrackingWebhookRequest) {
    const provided = request.headers["x-mock-gps-signature"] ?? "";
    const expected = this.sign(request.rawBody);
    const signatureValid =
      provided.length === expected.length &&
      timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
    if (!signatureValid) return { signatureValid, events: [] };
    const payload = JSON.parse(request.rawBody) as Array<{
      id: string;
      device: string;
      type: TrackingWebhookEvent["type"];
      at: string;
      lat?: number;
      lng?: number;
      speed?: number;
      ignition?: boolean;
    }>;
    const events: TrackingWebhookEvent[] = payload.map((e) => ({
      providerEventId: e.id,
      externalDeviceId: e.device,
      type: e.type,
      recordedAt: new Date(e.at),
      location:
        e.lat !== undefined && e.lng !== undefined
          ? { latitude: e.lat, longitude: e.lng, speedKmh: e.speed, ignitionOn: e.ignition }
          : undefined,
      raw: e,
    }));
    return { signatureValid, events };
  }
}

export function haversineKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}
