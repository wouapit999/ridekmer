# GPS / telematics integration

**Status: built in Milestone 7 with a mock provider.** The push contract, webhook receiver,
fleet map, geofences, access audit, retention purge and the immobilisation request workflow
(interface only) are live; a real vendor still needs to be contracted (OPEN_ITEMS #54).

## Principles

- A **generic commercial telematics provider** is the principal location system.
- Apple AirTag and Samsung SmartTag are modelled as `SECONDARY_RECOVERY_TAG` devices: a record
  of installation only. RideKmer does not claim continuous tracking or any application
  integration for them.
- **No covert tracking of people.** Vehicles are tracked; customers are informed in the rental
  agreement and privacy notice; owners consent to installation (`VehicleTrackerAssignment.
ownerConsentAt`, consent document type `gps_installation_consent`).
- **No automatic remote immobilisation.** `ImmobilisationProvider` is a future interface only.
  Any implementation must require: vehicle stationary confirmation, authorised staff, dual
  approval (`Approval` rows), recorded reason, provider acknowledgement and full audit history.

## Interfaces (`@ridekmer/tracking`)

`TrackingProvider`: `listDevices`, `getDevice`, `getLastLocation`, `getLocationHistory`,
`getTrips`, `processWebhook` (signature validation + normalised events: LOCATION, IGNITION__,
GEOFENCE__, TAMPER, POWER_*, OFFLINE/ONLINE).

## Data and access control

- `TrackerDevice.externalDeviceId` and serials are never rendered on public pages.
- `tracking.view_current`, `tracking.view_history`, `tracking.export`,
  `tracking.manage_devices` permissions; every read is logged in `TrackingAccessLog` with the
  requested range and reason.
- Retention: `GPS_LOCATION_RETENTION_DAYS` / `SystemSetting tracking.location_retention_days`;
  a cron purge job removes older `TrackingEvent` rows (M7).

## RideKmer push contract (ADR-027)

Vendors or an integration middleware POST a JSON array to
`https://<domain>/api/webhooks/gps/generic`, signed with HMAC-SHA256 over the raw body in the
`x-ridekmer-signature` header (`sha256=<hex>`; the mock uses `x-mock-gps-signature`):

```json
[
  {
    "id": "evt-123",
    "device": "IMEI-or-vendor-id",
    "type": "LOCATION",
    "at": "2026-10-15T10:00:00Z",
    "lat": 4.0511,
    "lng": 9.7679,
    "speed": 32,
    "heading": 180,
    "ignition": true,
    "power": "EXTERNAL",
    "battery": 92,
    "tamper": false
  }
]
```

`type` ∈ LOCATION, IGNITION_ON, IGNITION_OFF, GEOFENCE_ENTER, GEOFENCE_EXIT, TAMPER,
POWER_LOSS, POWER_RESTORED, OFFLINE, ONLINE. `id` must be stable per event (replays are
ignored). At most 1000 events and 512 KB per request. Responses: 200 processed (with counts),
400 malformed, 401 invalid signature, 404 unknown provider.

## Configuring a real provider

Set `GPS_PROVIDER=generic-rest`, `GPS_PROVIDER_BASE_URL`, `GPS_PROVIDER_API_KEY`,
`GPS_WEBHOOK_SECRET`; register the webhook URL with the vendor or middleware. The pull methods
of `GenericRestTrackingProvider` (`listDevices`, `getLastLocation`, …) throw
`NOT_IMPLEMENTED` until implemented from the vendor's official documentation; the application
does not need them because every position is read from the `TrackingEvent` store.

## Fleet map, history, access audit (ADR-028, ADR-030)

- `/admin/fleet`: last fix per tracked vehicle on a tile-based map; `/admin/fleet/<vehicle>`:
  history over a bounded range with a mandatory reason, trips, CSV export;
  `/admin/fleet/access`: who viewed what, when and why.
- `/admin/devices`, `/admin/geofences`, `/admin/immobilisation` for fleet managers.
- Daily `/api/cron/tracking-retention` purges events older than the retention setting.

## Immobilisation (ADR-029)

`ImmobilisationRequest` workflow: reason → stationary confirmation (latest fix ≤ 10 min, no
speed, ignition off; re-checked at execution) → two distinct approvers (`immobilisation.
approve`, never the requester) → execution. `getImmobilisationProvider()` returns `null`, so
execution records `UNAVAILABLE` and nothing is sent. Registering a provider is a reviewed
change behind that single hook and requires the legal and contractual conditions in
`docs/LEGAL_REVIEW_CHECKLIST.md`.
