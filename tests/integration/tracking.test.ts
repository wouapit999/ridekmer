import { randomUUID } from "node:crypto";

import { MockTrackingProvider } from "@ridekmer/tracking";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { assignDevice, registerDevice, unassignDevice } from "@/features/tracking/devices";
import { saveGeofence } from "@/features/tracking/geofences";
import {
  confirmStationary,
  decideImmobilisation,
  executeImmobilisation,
  requestImmobilisation,
} from "@/features/tracking/immobilisation";
import {
  ingestTrackingEvents,
  ingestTrackingWebhook,
  purgeLocationHistory,
} from "@/features/tracking/ingest";
import { getFleetSnapshot, getVehicleTrack, listAccessLogs } from "@/features/tracking/queries";
import { db } from "@/server/db";
import { resetTrackingProviderForTests } from "@/server/tracking/registry";

let vehicleId: string;
let ownedVehicleId: string;
let staffId: string;
let approverA: string;
let approverB: string;
let deviceId: string;
let geofenceId: string;
const provider = new MockTrackingProvider("test-gps-secret");
const ext = `TRK-${randomUUID().slice(0, 8)}`;

function minutesAgo(m: number) {
  return new Date(Date.now() - m * 60_000);
}

beforeAll(async () => {
  resetTrackingProviderForTests(provider);
  const city = await db.city.findUniqueOrThrow({ where: { slug: "douala" } });
  const owner = await db.user.create({
    data: { email: `trk-owner-${randomUUID()}@ridekmer.test`, name: "Tracking Owner" },
  });
  const profile = await db.ownerProfile.create({
    data: { userId: owner.id, displayName: "Tracking Owner", kycApprovedAt: new Date() },
  });
  const base = {
    cityId: city.id,
    make: "Track",
    manufacturingYear: 2022,
    category: "SEDAN" as const,
    transmission: "AUTOMATIC" as const,
    fuelType: "PETROL" as const,
    seats: 5,
    dailyPriceXaf: 30000,
    securityDepositXaf: 50000,
    status: "ACTIVE" as const,
    documentsValid: true,
    publishedAt: new Date(),
  };
  const [v1, v2, s, a, b] = await Promise.all([
    db.vehicle.create({
      data: {
        ...base,
        model: "Owned",
        registrationNumber: `TR-${randomUUID().slice(0, 6).toUpperCase()}`,
        ownershipModel: "RIDEKMER_OWNED",
      },
    }),
    db.vehicle.create({
      data: {
        ...base,
        model: "Managed",
        registrationNumber: `TO-${randomUUID().slice(0, 6).toUpperCase()}`,
        ownershipModel: "FULLY_MANAGED_OWNER_VEHICLE",
        ownerProfileId: profile.id,
      },
    }),
    db.user.create({
      data: { email: `trk-staff-${randomUUID()}@ridekmer.test`, name: "Fleet Staff" },
    }),
    db.user.create({ data: { email: `trk-a-${randomUUID()}@ridekmer.test`, name: "Approver A" } }),
    db.user.create({ data: { email: `trk-b-${randomUUID()}@ridekmer.test`, name: "Approver B" } }),
  ]);
  vehicleId = v1.id;
  ownedVehicleId = v2.id;
  staffId = s.id;
  approverA = a.id;
  approverB = b.id;
  const fence = await saveGeofence({
    name: `Test zone ${ext}`,
    type: "RESTRICTED",
    geometry: { kind: "circle", center: { latitude: 4.2, longitude: 9.9 }, radiusMeters: 3000 },
    alertOnExit: true,
    isActive: true,
    actorId: staffId,
  });
  geofenceId = fence.id;
});

afterAll(async () => {
  resetTrackingProviderForTests(undefined);
  await db.geofence.deleteMany({ where: { id: geofenceId } });
  await db.$disconnect();
});

describe("devices and consent", () => {
  it("registers a device, requires owner consent for owner vehicles and prevents double assignment", async () => {
    const device = await registerDevice({
      type: "COMMERCIAL_GPS",
      provider: provider.id,
      externalDeviceId: ext,
      serialNumber: "SN-123",
      actorId: staffId,
    });
    deviceId = device.id;
    expect(device.serialNumberEnc).not.toContain("SN-123");
    await expect(
      registerDevice({
        type: "COMMERCIAL_GPS",
        provider: provider.id,
        externalDeviceId: ext,
        actorId: staffId,
      }),
    ).rejects.toMatchObject({ code: "DUPLICATE_DEVICE" });
    await expect(
      assignDevice({ deviceId, vehicleId: ownedVehicleId, actorId: staffId }),
    ).rejects.toMatchObject({ code: "CONSENT_REQUIRED" });
    const assignment = await assignDevice({ deviceId, vehicleId, actorId: staffId });
    expect(assignment.vehicleId).toBe(vehicleId);
    await expect(
      assignDevice({
        deviceId,
        vehicleId: ownedVehicleId,
        ownerConsentAt: new Date(),
        actorId: staffId,
      }),
    ).rejects.toMatchObject({ code: "ALREADY_ASSIGNED" });
  });
});

describe("ingestion, geofences and alerts", () => {
  it("stores signed webhook events, dedupes, evaluates geofences and raises alerts", async () => {
    const body = JSON.stringify([
      {
        id: `${ext}-1`,
        device: ext,
        type: "LOCATION",
        at: minutesAgo(30).toISOString(),
        lat: 4.05,
        lng: 9.77,
        speed: 30,
        ignition: true,
      },
      {
        id: `${ext}-2`,
        device: ext,
        type: "LOCATION",
        at: minutesAgo(20).toISOString(),
        lat: 4.2,
        lng: 9.9,
        speed: 20,
        ignition: true,
      },
      {
        id: `${ext}-3`,
        device: ext,
        type: "LOCATION",
        at: minutesAgo(10).toISOString(),
        lat: 4.05,
        lng: 9.77,
        speed: 10,
        ignition: true,
      },
      {
        id: `${ext}-4`,
        device: "UNKNOWN-DEVICE",
        type: "LOCATION",
        at: minutesAgo(5).toISOString(),
        lat: 4.05,
        lng: 9.77,
      },
    ]);
    const forged = await ingestTrackingWebhook("generic", {
      headers: { "x-mock-gps-signature": "00" },
      rawBody: body,
    });
    expect(forged.httpStatus).toBe(401);
    const malformed = await ingestTrackingWebhook("generic", {
      headers: { "x-mock-gps-signature": provider.sign("{bad") },
      rawBody: "{bad",
    });
    expect(malformed.httpStatus).toBe(400);
    const ok = await ingestTrackingWebhook("generic", {
      headers: { "x-mock-gps-signature": provider.sign(body) },
      rawBody: body,
    });
    expect(ok.httpStatus).toBe(200);
    expect(ok.result).toBe("PROCESSED");
    if (!("ingest" in ok) || !ok.ingest) throw new Error("expected an ingest summary");
    expect(ok.ingest.stored).toBe(3);
    expect(ok.ingest.unknownDevices).toBe(1);
    expect(ok.ingest.geofenceEvents).toBeGreaterThanOrEqual(2); // test zone enter + exit (the seeded city zone may add one)
    const again = await ingestTrackingWebhook("generic", {
      headers: { "x-mock-gps-signature": provider.sign(body) },
      rawBody: body,
    });
    if (!("ingest" in again) || !again.ingest) throw new Error("expected an ingest summary");
    expect(again.ingest.duplicates).toBe(3);
    const events = await db.trackingEvent.findMany({
      where: { vehicleId },
      orderBy: { recordedAt: "asc" },
    });
    expect(
      events.filter((e) => e.type === "GEOFENCE_ENTER" && e.geofenceId === geofenceId),
    ).toHaveLength(1);
    expect(
      events.filter((e) => e.type === "GEOFENCE_EXIT" && e.geofenceId === geofenceId),
    ).toHaveLength(1);
    expect(
      await db.notification.count({
        where: { templateKey: "tracking_alert", entityId: vehicleId },
      }),
    ).toBeGreaterThanOrEqual(2);
    const device = await db.trackerDevice.findUniqueOrThrow({ where: { id: deviceId } });
    expect(device.status).toBe("ACTIVE");
    expect(device.lastSeenAt).not.toBeNull();
  });

  it("flags tamper and power loss on the device", async () => {
    await ingestTrackingEvents(provider.id, [
      {
        providerEventId: `${ext}-tamper`,
        externalDeviceId: ext,
        type: "TAMPER",
        recordedAt: minutesAgo(4),
        raw: {},
      },
      {
        providerEventId: `${ext}-power`,
        externalDeviceId: ext,
        type: "POWER_LOSS",
        recordedAt: minutesAgo(3),
        raw: {},
      },
    ]);
    const device = await db.trackerDevice.findUniqueOrThrow({ where: { id: deviceId } });
    expect(device.status).toBe("TAMPER_ALERT");
    expect(device.powerStatus).toBe("BATTERY");
  });
});

describe("fleet reads are logged, bounded and exportable", () => {
  it("returns the latest fix per vehicle and logs the access", async () => {
    const fleet = await getFleetSnapshot(staffId);
    const mine = fleet.find((v) => v.vehicleId === vehicleId)!;
    expect(mine.latitude).toBeCloseTo(4.05, 2);
    expect(mine.deviceStatus).toBe("TAMPER_ALERT");
    const logs = await listAccessLogs({ vehicleId: "FLEET", page: 1 });
    expect(logs.logs.some((l) => l.userId === staffId && l.accessType === "VIEW_CURRENT")).toBe(
      true,
    );
  });

  it("requires and logs a reason for history, caps the range and summarises trips", async () => {
    const track = await getVehicleTrack({
      vehicleId,
      from: new Date(Date.now() - 400 * 86_400_000),
      to: new Date(),
      viewerId: staffId,
      reason: "incident investigation IN-TEST",
    });
    expect(track).not.toBeNull();
    expect(track!.fixes).toHaveLength(3);
    expect(track!.distanceKm).toBeGreaterThan(40);
    expect(track!.to.getTime() - track!.from.getTime()).toBeLessThanOrEqual(31 * 86_400_000 + 1000);
    const logs = await listAccessLogs({ vehicleId, page: 1 });
    expect(logs.logs[0]?.reason).toBe("incident investigation IN-TEST");
    expect(logs.logs[0]?.accessType).toBe("VIEW_HISTORY");
  });

  it("purges history beyond the retention period", async () => {
    await db.trackingEvent.create({
      data: {
        deviceId,
        vehicleId,
        type: "LOCATION",
        recordedAt: new Date(Date.now() - 200 * 86_400_000),
        latitude: 4,
        longitude: 9,
        providerEventId: `${ext}-old`,
      },
    });
    const result = await purgeLocationHistory(90);
    expect(result.deleted).toBeGreaterThanOrEqual(1);
    expect(await db.trackingEvent.count({ where: { providerEventId: `${ext}-old` } })).toBe(0);
    expect(await db.trackingEvent.count({ where: { vehicleId, type: "LOCATION" } })).toBe(3);
  });
});

describe("immobilisation: interface only, never automatic", () => {
  it("needs a stationary vehicle, two distinct approvers and ends UNAVAILABLE without a provider", async () => {
    await expect(
      requestImmobilisation({ vehicleId, reason: "short", actorId: staffId }),
    ).rejects.toMatchObject({ code: "REASON_REQUIRED" });
    const request = await requestImmobilisation({
      vehicleId,
      reason: "Theft reported, police report PR-2026-001",
      actorId: staffId,
    });
    await expect(
      requestImmobilisation({
        vehicleId,
        reason: "Second request while one is open",
        actorId: staffId,
      }),
    ).rejects.toMatchObject({ code: "INVALID_STATUS" });
    // Latest fix is moving (speed 10, ignition on) → not stationary.
    await expect(
      confirmStationary({ requestId: request.id, actorId: staffId }),
    ).rejects.toMatchObject({ code: "NOT_STATIONARY" });
    await ingestTrackingEvents(provider.id, [
      {
        providerEventId: `${ext}-stop`,
        externalDeviceId: ext,
        type: "LOCATION",
        recordedAt: new Date(),
        location: { latitude: 4.05, longitude: 9.77, speedKmh: 0, ignitionOn: false },
        raw: {},
      },
    ]);
    await expect(
      decideImmobilisation({ requestId: request.id, approverId: approverA, decision: "APPROVED" }),
    ).rejects.toMatchObject({ code: "INVALID_STATUS" });
    const confirmed = await confirmStationary({ requestId: request.id, actorId: staffId });
    expect(confirmed.status).toBe("STATIONARY_CONFIRMED");
    await expect(
      decideImmobilisation({ requestId: request.id, approverId: staffId, decision: "APPROVED" }),
    ).rejects.toMatchObject({ code: "SELF_APPROVAL" });
    const first = await decideImmobilisation({
      requestId: request.id,
      approverId: approverA,
      decision: "APPROVED",
    });
    expect(first.status).toBe("STATIONARY_CONFIRMED");
    await expect(
      decideImmobilisation({ requestId: request.id, approverId: approverA, decision: "APPROVED" }),
    ).rejects.toMatchObject({ code: "ALREADY_DECIDED" });
    await expect(
      executeImmobilisation({ requestId: request.id, actorId: approverA }),
    ).rejects.toMatchObject({ code: "INVALID_STATUS" });
    const second = await decideImmobilisation({
      requestId: request.id,
      approverId: approverB,
      decision: "APPROVED",
    });
    expect(second.status).toBe("APPROVED");
    const executed = await executeImmobilisation({ requestId: request.id, actorId: approverB });
    expect(executed.status).toBe("UNAVAILABLE");
    expect(executed.providerMessage).toMatch(/No immobilisation provider/);
    expect(
      await db.auditLog.count({
        where: { entityType: "ImmobilisationRequest", entityId: request.id },
      }),
    ).toBeGreaterThanOrEqual(5);
  });

  it("unassigns the device and stops attributing events to the vehicle", async () => {
    await unassignDevice({ deviceId, actorId: staffId, reason: "end of test" });
    const result = await ingestTrackingEvents(provider.id, [
      {
        providerEventId: `${ext}-after`,
        externalDeviceId: ext,
        type: "LOCATION",
        recordedAt: new Date(),
        location: { latitude: 4.05, longitude: 9.77 },
        raw: {},
      },
    ]);
    expect(result.stored).toBe(1);
    expect(
      (await db.trackingEvent.findFirstOrThrow({ where: { providerEventId: `${ext}-after` } }))
        .vehicleId,
    ).toBeNull();
  });
});
