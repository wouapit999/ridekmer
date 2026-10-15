export interface DeviceLocation {
  deviceId: string;
  recordedAt: Date;
  latitude: number;
  longitude: number;
  speedKmh?: number;
  heading?: number;
  ignitionOn?: boolean;
  powerStatus?: "EXTERNAL" | "BATTERY" | "UNKNOWN";
  batteryPercent?: number;
  tamper?: boolean;
}

export interface DeviceInfo {
  externalDeviceId: string;
  model?: string;
  online: boolean;
  lastSeenAt?: Date;
}

export interface TripSummary {
  startAt: Date;
  endAt: Date;
  distanceKm: number;
  startLocation: { latitude: number; longitude: number };
  endLocation: { latitude: number; longitude: number };
}

export interface TrackingWebhookRequest {
  headers: Record<string, string>;
  rawBody: string;
}

export interface TrackingWebhookEvent {
  providerEventId: string;
  externalDeviceId: string;
  type:
    | "LOCATION"
    | "IGNITION_ON"
    | "IGNITION_OFF"
    | "GEOFENCE_ENTER"
    | "GEOFENCE_EXIT"
    | "TAMPER"
    | "POWER_LOSS"
    | "POWER_RESTORED"
    | "OFFLINE"
    | "ONLINE";
  recordedAt: Date;
  location?: Omit<DeviceLocation, "deviceId" | "recordedAt">;
  raw: unknown;
}

/**
 * Generic commercial telematics provider. Consumer tags (AirTag, SmartTag) are NOT providers:
 * they are recorded as secondary recovery devices with no live integration.
 */
export interface TrackingProvider {
  readonly id: string;
  readonly environment: "mock" | "sandbox" | "production";
  listDevices(): Promise<DeviceInfo[]>;
  getDevice(externalDeviceId: string): Promise<DeviceInfo | null>;
  getLastLocation(externalDeviceId: string): Promise<DeviceLocation | null>;
  getLocationHistory(externalDeviceId: string, from: Date, to: Date): Promise<DeviceLocation[]>;
  getTrips(externalDeviceId: string, from: Date, to: Date): Promise<TripSummary[]>;
  processWebhook(
    request: TrackingWebhookRequest,
  ): Promise<{ signatureValid: boolean; events: TrackingWebhookEvent[] }>;
}

/**
 * FUTURE interface only. No implementation performs immobilisation today. Any future provider
 * must enforce: vehicle stationary, authorised staff, dual approval, recorded reason, provider
 * acknowledgement and a full audit trail (see docs/GPS_INTEGRATION.md).
 */
export interface ImmobilisationProvider {
  readonly id: string;
  requestImmobilisation(input: {
    externalDeviceId: string;
    approvalIds: [string, string];
    reason: string;
    requestedBy: string;
    stationaryConfirmedAt: Date;
  }): Promise<{ accepted: boolean; providerReference?: string; message?: string }>;
}
