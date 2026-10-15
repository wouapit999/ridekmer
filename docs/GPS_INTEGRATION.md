# GPS / telematics integration

**Status: mock provider only (Milestone 1).** A generic REST provider shell, webhook receiver,
fleet map and geofences are delivered in Milestone 7.

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

## Configuring a real provider (M7)

Set `GPS_PROVIDER=generic-rest`, `GPS_PROVIDER_BASE_URL`, `GPS_PROVIDER_API_KEY`,
`GPS_WEBHOOK_SECRET`; register `https://<domain>/api/webhooks/gps/generic` with the provider.
The generic REST adapter maps the provider's device/position endpoints through a small
configuration object so that no vendor-specific code leaks into business logic.
