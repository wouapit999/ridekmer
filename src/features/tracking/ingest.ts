import {
  geofenceTransitions,
  pointInGeometry,
  type TrackingWebhookEvent,
  type TrackingWebhookRequest,
  TrackingProviderError,
} from "@ridekmer/tracking";

import { formatIsoDate } from "@/lib/dates";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/server/audit";
import { db } from "@/server/db";
import { getTrackingProvider, GPS_WEBHOOK_SLUGS } from "@/server/tracking/registry";

import type { Prisma } from "@/generated/prisma/client";

import { activeGeofences } from "./geofences";

export interface IngestResult {
  received: number;
  stored: number;
  duplicates: number;
  unknownDevices: number;
  geofenceEvents: number;
  alerts: number;
}

async function staffAlert(
  subject: string,
  body: string,
  entityType: string,
  entityId: string,
  dedupeKey: string,
) {
  await db.notification
    .create({
      data: {
        channel: "IN_APP",
        templateKey: "tracking_alert",
        locale: "fr",
        subject,
        body,
        status: "SENT",
        provider: "in-app",
        entityType,
        entityId,
        dedupeKey,
        sentAt: new Date(),
      },
    })
    .catch(() => undefined);
}

/**
 * Store normalised provider events for registered devices, update device health, evaluate
 * geofences on each fix and raise staff alerts for exits, tamper and power loss. Duplicate
 * provider event ids are ignored. Events for unknown devices are counted and dropped.
 */
export async function ingestTrackingEvents(
  providerId: string,
  events: TrackingWebhookEvent[],
): Promise<IngestResult> {
  const result: IngestResult = {
    received: events.length,
    stored: 0,
    duplicates: 0,
    unknownDevices: 0,
    geofenceEvents: 0,
    alerts: 0,
  };
  const fences = await activeGeofences();
  const byDevice = new Map<string, TrackingWebhookEvent[]>();
  for (const e of events)
    byDevice.set(e.externalDeviceId, [...(byDevice.get(e.externalDeviceId) ?? []), e]);

  for (const [externalDeviceId, list] of byDevice) {
    const device = await db.trackerDevice.findUnique({
      where: { provider_externalDeviceId: { provider: providerId, externalDeviceId } },
      include: { assignments: { where: { unassignedAt: null }, take: 1 } },
    });
    if (!device) {
      result.unknownDevices += list.length;
      continue;
    }
    const vehicleId = device.assignments[0]?.vehicleId ?? null;
    let previousInside: string[] = [];
    if (vehicleId) {
      const last = await db.trackingEvent.findFirst({
        where: { vehicleId, type: "LOCATION" },
        orderBy: { recordedAt: "desc" },
        select: { insideGeofences: true },
      });
      previousInside = last?.insideGeofences ?? [];
    }
    for (const e of [...list].sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime())) {
      const inside =
        e.type === "LOCATION" && e.location
          ? fences
              .filter((g) =>
                pointInGeometry(
                  { latitude: e.location!.latitude, longitude: e.location!.longitude },
                  g.parsed,
                ),
              )
              .map((g) => g.id)
          : previousInside;
      try {
        await db.trackingEvent.create({
          data: {
            deviceId: device.id,
            vehicleId,
            type: e.type,
            recordedAt: e.recordedAt,
            latitude: e.location?.latitude ?? null,
            longitude: e.location?.longitude ?? null,
            speedKmh: e.location?.speedKmh ?? null,
            heading: e.location?.heading ?? null,
            ignitionOn: e.location?.ignitionOn ?? null,
            powerStatus: e.location?.powerStatus ?? null,
            tamper: e.location?.tamper ?? (e.type === "TAMPER" ? true : null),
            rawPayload: e.raw as Prisma.InputJsonValue,
            providerEventId: e.providerEventId,
            insideGeofences: inside,
          },
        });
      } catch (error) {
        if ((error as { code?: string }).code === "P2002") {
          result.duplicates += 1;
          continue;
        }
        throw error;
      }
      result.stored += 1;

      const health: Prisma.TrackerDeviceUpdateInput = { lastSeenAt: e.recordedAt };
      if (e.location?.batteryPercent !== undefined)
        health.batteryPercent = e.location.batteryPercent;
      if (e.location?.powerStatus) health.powerStatus = e.location.powerStatus;
      if (e.type === "TAMPER" || e.location?.tamper) {
        health.tamperStatus = "ALERT";
        health.status = "TAMPER_ALERT";
      } else if (e.type === "OFFLINE") health.status = "OFFLINE";
      else if (device.status === "INSTALLED" || device.status === "OFFLINE")
        health.status = "ACTIVE";
      if (e.type === "POWER_LOSS") health.powerStatus = "BATTERY";
      if (e.type === "POWER_RESTORED") health.powerStatus = "EXTERNAL";
      await db.trackerDevice.update({ where: { id: device.id }, data: health });

      if (vehicleId && (e.type === "TAMPER" || e.type === "POWER_LOSS" || e.location?.tamper)) {
        await staffAlert(
          "Tracker alert",
          `${e.type === "POWER_LOSS" ? "Power loss" : "Tamper"} on vehicle ${vehicleId}`,
          "Vehicle",
          vehicleId,
          `tracking_${e.type.toLowerCase()}:${device.id}:${e.providerEventId}`,
        );
        result.alerts += 1;
      }

      if (vehicleId && e.type === "LOCATION" && e.location) {
        for (const t of geofenceTransitions(previousInside, inside)) {
          const fence = fences.find((g) => g.id === t.geofenceId);
          await db.trackingEvent
            .create({
              data: {
                deviceId: device.id,
                vehicleId,
                type: t.type,
                recordedAt: e.recordedAt,
                latitude: e.location.latitude,
                longitude: e.location.longitude,
                geofenceId: t.geofenceId,
                insideGeofences: inside,
                providerEventId: `${e.providerEventId}:${t.type}:${t.geofenceId}`,
              },
            })
            .catch(() => undefined);
          result.geofenceEvents += 1;
          if (
            fence &&
            ((t.type === "GEOFENCE_EXIT" && fence.alertOnExit) ||
              (t.type === "GEOFENCE_ENTER" && fence.type === "RESTRICTED"))
          ) {
            await staffAlert(
              "Geofence alert",
              `Vehicle ${vehicleId} ${t.type === "GEOFENCE_EXIT" ? "left" : "entered"} ${fence.name} at ${formatIsoDate(e.recordedAt)}`,
              "Vehicle",
              vehicleId,
              `geofence:${vehicleId}:${t.geofenceId}:${t.type}:${e.providerEventId}`,
            );
            result.alerts += 1;
          }
        }
        previousInside = inside;
      }
    }
  }
  logger.info("tracking.ingest", { provider: providerId, ...result });
  return result;
}

/** Webhook entry point: verify the signature with the provider adapter, then ingest. */
export async function ingestTrackingWebhook(slug: string, request: TrackingWebhookRequest) {
  if (!(GPS_WEBHOOK_SLUGS as readonly string[]).includes(slug))
    return { httpStatus: 404 as const, result: "UNKNOWN_PROVIDER" as const };
  let provider;
  try {
    provider = getTrackingProvider();
  } catch (error) {
    if (error instanceof TrackingProviderError)
      return { httpStatus: 404 as const, result: "UNKNOWN_PROVIDER" as const };
    throw error;
  }
  let parsed;
  try {
    parsed = await provider.processWebhook(request);
  } catch (error) {
    if (error instanceof TrackingProviderError)
      return { httpStatus: 400 as const, result: "MALFORMED" as const, detail: error.message };
    throw error;
  }
  if (!parsed.signatureValid) {
    await recordAudit({
      actorType: "WEBHOOK",
      action: "tracking.webhook.invalid_signature",
      entityType: "TrackingProvider",
      entityId: provider.id,
    });
    return { httpStatus: 401 as const, result: "INVALID_SIGNATURE" as const };
  }
  const ingest = await ingestTrackingEvents(provider.id, parsed.events);
  return { httpStatus: 200 as const, result: "PROCESSED" as const, ingest };
}

/** Daily: delete location history older than the configured retention (privacy by design). */
export async function purgeLocationHistory(retentionDays: number, now = new Date()) {
  const cutoff = new Date(now.getTime() - retentionDays * 86_400_000);
  const deleted = await db.trackingEvent.deleteMany({ where: { recordedAt: { lt: cutoff } } });
  await recordAudit({
    actorType: "CRON",
    action: "tracking.retention.purge",
    entityType: "TrackingEvent",
    after: { retentionDays, cutoff, deleted: deleted.count },
  });
  logger.info("cron.tracking_retention", { retentionDays, deleted: deleted.count });
  return { deleted: deleted.count, cutoff };
}
