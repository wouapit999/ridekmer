import { createHmac, timingSafeEqual } from "node:crypto";

import type {
  DeviceInfo,
  DeviceLocation,
  TrackingProvider,
  TrackingWebhookEvent,
  TrackingWebhookRequest,
  TripSummary,
} from "../types";

export class TrackingProviderError extends Error {
  constructor(
    public readonly code: "NOT_CONFIGURED" | "NOT_IMPLEMENTED" | "INVALID_WEBHOOK",
    message?: string,
  ) {
    super(message ?? code);
    this.name = "TrackingProviderError";
  }
}

export interface GenericRestConfig {
  environment: "sandbox" | "production";
  baseUrl?: string;
  apiKey?: string;
  webhookSecret?: string;
  /** Header carrying the HMAC-SHA256 hex signature of the raw body (default x-ridekmer-signature). */
  signatureHeader?: string;
}

/**
 * RideKmer's own push contract for commercial telematics vendors (documented in
 * docs/GPS_INTEGRATION.md): the vendor (or an integration middleware) POSTs a JSON array of
 * events signed with HMAC-SHA256 over the raw body. Pull methods against the vendor's REST API
 * are deliberately NOT implemented until the vendor's official documentation is available;
 * the application reads positions from its own event store.
 */
export class GenericRestTrackingProvider implements TrackingProvider {
  readonly id = "generic-rest";
  readonly environment: "sandbox" | "production";
  private readonly webhookSecret: string;
  private readonly signatureHeader: string;

  constructor(config: GenericRestConfig) {
    const missing = [
      !config.baseUrl ? "GPS_PROVIDER_BASE_URL" : null,
      !config.apiKey ? "GPS_PROVIDER_API_KEY" : null,
      !config.webhookSecret ? "GPS_WEBHOOK_SECRET" : null,
    ].filter(Boolean);
    if (missing.length)
      throw new TrackingProviderError(
        "NOT_CONFIGURED",
        `Missing configuration: ${missing.join(", ")}`,
      );
    this.environment = config.environment;
    this.webhookSecret = config.webhookSecret!;
    this.signatureHeader = (config.signatureHeader ?? "x-ridekmer-signature").toLowerCase();
  }

  listDevices(): Promise<DeviceInfo[]> {
    return Promise.reject(
      new TrackingProviderError(
        "NOT_IMPLEMENTED",
        "generic-rest.listDevices requires the vendor API documentation",
      ),
    );
  }
  getDevice(_id: string): Promise<DeviceInfo | null> {
    return Promise.reject(
      new TrackingProviderError(
        "NOT_IMPLEMENTED",
        "generic-rest.getDevice requires the vendor API documentation",
      ),
    );
  }
  getLastLocation(_id: string): Promise<DeviceLocation | null> {
    return Promise.reject(
      new TrackingProviderError(
        "NOT_IMPLEMENTED",
        "generic-rest.getLastLocation requires the vendor API documentation",
      ),
    );
  }
  getLocationHistory(_id: string, _from: Date, _to: Date): Promise<DeviceLocation[]> {
    return Promise.reject(
      new TrackingProviderError(
        "NOT_IMPLEMENTED",
        "generic-rest.getLocationHistory requires the vendor API documentation",
      ),
    );
  }
  getTrips(_id: string, _from: Date, _to: Date): Promise<TripSummary[]> {
    return Promise.reject(
      new TrackingProviderError(
        "NOT_IMPLEMENTED",
        "generic-rest.getTrips requires the vendor API documentation",
      ),
    );
  }

  sign(rawBody: string): string {
    return createHmac("sha256", this.webhookSecret).update(rawBody).digest("hex");
  }

  async processWebhook(request: TrackingWebhookRequest) {
    const provided = (request.headers[this.signatureHeader] ?? "")
      .replace(/^sha256=/, "")
      .trim()
      .toLowerCase();
    const expected = this.sign(request.rawBody);
    const signatureValid =
      provided.length === expected.length &&
      timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
    if (!signatureValid) return { signatureValid, events: [] };
    return { signatureValid, events: parseRideKmerEvents(request.rawBody) };
  }
}

const EVENT_TYPES = new Set([
  "LOCATION",
  "IGNITION_ON",
  "IGNITION_OFF",
  "GEOFENCE_ENTER",
  "GEOFENCE_EXIT",
  "TAMPER",
  "POWER_LOSS",
  "POWER_RESTORED",
  "OFFLINE",
  "ONLINE",
]);

/**
 * RideKmer push format: `[{ id, device, type, at, lat?, lng?, speed?, heading?, ignition?,
 * power?, battery?, tamper? }]`. Unknown types and malformed rows are rejected as a whole.
 */
export function parseRideKmerEvents(rawBody: string): TrackingWebhookEvent[] {
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    throw new TrackingProviderError("INVALID_WEBHOOK", "Malformed JSON");
  }
  if (!Array.isArray(payload) || payload.length === 0 || payload.length > 1000)
    throw new TrackingProviderError("INVALID_WEBHOOK", "Expected a non-empty array");
  return payload.map((row, index) => {
    const e = row as Record<string, unknown>;
    if (
      typeof e.id !== "string" ||
      typeof e.device !== "string" ||
      typeof e.type !== "string" ||
      !EVENT_TYPES.has(e.type) ||
      typeof e.at !== "string"
    )
      throw new TrackingProviderError(
        "INVALID_WEBHOOK",
        `Row ${index} is missing id/device/type/at`,
      );
    const at = new Date(e.at);
    if (Number.isNaN(at.getTime()))
      throw new TrackingProviderError("INVALID_WEBHOOK", `Row ${index} has an invalid timestamp`);
    const hasFix = typeof e.lat === "number" && typeof e.lng === "number";
    if (hasFix && (Math.abs(e.lat as number) > 90 || Math.abs(e.lng as number) > 180))
      throw new TrackingProviderError("INVALID_WEBHOOK", `Row ${index} has an invalid coordinate`);
    return {
      providerEventId: e.id,
      externalDeviceId: e.device,
      type: e.type as TrackingWebhookEvent["type"],
      recordedAt: at,
      location: hasFix
        ? {
            latitude: e.lat as number,
            longitude: e.lng as number,
            speedKmh: typeof e.speed === "number" ? e.speed : undefined,
            heading: typeof e.heading === "number" ? e.heading : undefined,
            ignitionOn: typeof e.ignition === "boolean" ? e.ignition : undefined,
            powerStatus: e.power === "EXTERNAL" || e.power === "BATTERY" ? e.power : undefined,
            batteryPercent: typeof e.battery === "number" ? e.battery : undefined,
            tamper: typeof e.tamper === "boolean" ? e.tamper : undefined,
          }
        : undefined,
      raw: row,
    };
  });
}
