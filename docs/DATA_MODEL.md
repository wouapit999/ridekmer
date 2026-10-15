# Data model

Source of truth: `prisma/schema.prisma` (70 models) and the hand-written SQL at the end of the
initial migration (`prisma/migrations/*_init/migration.sql`). This page explains the intent.

## Conventions

- Primary keys are `cuid()` strings. Human references (`Booking.reference`, `Incident.reference`,
  `SupportCase.reference`) use an unambiguous alphabet (`src/lib/ids.ts`).
- All money columns are `Int` XAF and suffixed `Xaf`; percentages are `Bps` (basis points).
- `createdAt` / `updatedAt` on mutable models. Soft delete (`deletedAt`) only on `User` and
  `Vehicle`, where history must survive.
- Sensitive values are stored encrypted (`*Enc`) with an HMAC lookup hash (`*Hash`) — identity
  numbers, driving licence numbers, VIN, bank accounts, SIM/serial numbers.
- Append-only tables (database triggers block UPDATE/DELETE): `LedgerEntry`,
  `BookingPriceSnapshot`, `SignatureEvidence`, `AuditLog`.

## Domains

### Identity and access

`User` (Better Auth core + `status`, `preferredLocale`), `Session`, `Account`, `Verification`,
`TwoFactor`, `RateLimit` (Better Auth), `Role`, `Permission`, `RolePermission`, `UserRole`
(with optional `expiresAt`). Profiles: `CustomerProfile`, `OwnerProfile` (+ `CompanyProfile`),
`ChauffeurProfile`, `Address`. KYC: `VerificationCase` → `VerificationDocument` (versioned).

### Geography

`City` (seeded: Douala, Yaoundé; fully configurable) → `Branch`. `Geofence` (GeoJSON or circle).

### Vehicles and documents

`Vehicle` (all attributes from the brief, `ownershipModel`, `status`, pricing, deposit,
allowances, `documentsValid`, `version`), `VehicleManagementConfig` (who does what for
self-managed vehicles), `VehicleFeature`, `VehicleImage`, `VehicleAvailability` (blocks),
`DocumentType` (configurable, seeded with 14 types), `VehicleDocument` (versioned via
`previousVersionId`, status lifecycle DRAFT→…→VERIFIED/REJECTED/EXPIRED/REPLACED, alert
tracking), `DocumentOverride` (administrator override with reason + expiry).

### Telematics

`TrackerDevice` (type COMMERCIAL_GPS or SECONDARY_RECOVERY_TAG; provider id never public),
`VehicleTrackerAssignment` (with owner consent timestamp), `TrackingEvent` (location, ignition,
tamper, power, geofence; unique per provider event id), `TrackingAccessLog` (every current or
historical access).

### Pricing and bookings

`PricingRule`, `PromoCode`, `ReservationHold` (checkout hold with expiry; exclusion constraint),
`Booking` (status machine, dates, handover modes, `version`), `BookingStatusHistory`,
`BookingAddOn`, `BookingPriceSnapshot` (immutable, sequence per booking, full breakdown JSON).

### Payments and ledger

`Payment` (purpose RENTAL / SECURITY_DEPOSIT / EXTENSION / ADDITIONAL_CHARGE, method, provider,
`idempotencyKey` unique, `refundedXaf`), `PaymentAttempt`, `PaymentWebhookEvent` (unique
provider event id = replay protection, signature validity, payload hash), `Refund`, `Approval`
(dual approval for refunds, payouts, overrides), `IdempotencyKey` (generic request
idempotency), `LedgerAccount`, `LedgerEntry` (double-entry: debit/credit accounts, links to
booking/payment/refund/payout/owner/vehicle/expense, reversal link), `OwnerPayout`.

### Contracts

`ContractTemplate` → `ContractTemplateVersion` (locale, markdown body, variables, checksum) →
`GeneratedContract` (immutable rendered copy + checksum + variables snapshot) →
`SignatureEvidence` (method CLICK_TO_ACCEPT / OTP_CONFIRMED / CERTIFIED_PROVIDER, IP, UA).

### Operations

`Inspection` (pickup/return/periodic, condition JSON blocks, consented geolocation,
acknowledgements, `clientDraftId` for offline sync), `InspectionPhoto`, `VehicleDamage`
(normalised marker coordinates on RideKmer's own outline diagram), `MaintenanceSchedule`,
`MaintenanceRecord`, `Expense` (allocation owner / RideKmer / customer / shared), `Incident`,
`IncidentStatusHistory`, `InsuranceClaim`.

### Engagement and platform

`Review`, `NotificationTemplate` (seeded bilingual defaults), `Notification`,
`NotificationPreference`, `PushSubscription`, `SupportCase`, `DataRequest` (export/deletion),
`SystemSetting` (typed key/value, seeded placeholders), `AuditLog`.

## Database-level invariants (hand-written SQL)

| Constraint                             | Purpose                                                      |
| -------------------------------------- | ------------------------------------------------------------ |
| `Booking_no_overlap_excl` (btree_gist) | No two bookings in blocking statuses overlap on one vehicle  |
| `ReservationHold_no_overlap_excl`      | Active checkout holds never overlap                          |
| `*_range_chk`                          | `endAt > startAt`, `rentalDays >= 1`                         |
| `*_amount_chk`                         | Positive amounts, refunds ≤ captured, debit ≠ credit account |
| `Review_rating_chk`                    | Rating 1–5                                                   |
| `*_append_only` triggers               | Financial facts and audit rows cannot be updated or deleted  |

## Indexes

Every foreign key used in filters has an index; search-critical composites exist on
`Vehicle(status, cityId)`, `Vehicle(category, transmission, fuelType)`, `Booking(vehicleId,
startAt, endAt)`, `VehicleDocument(expiryDate, status)`, `TrackingEvent(vehicleId, recordedAt)`
and `AuditLog(entityType, entityId, createdAt)`.

## Evolution

- New migrations via `pnpm db:migrate --name <change>`; committed SQL is the contract.
- Prefer additive changes; destructive migrations need an ADR and a backup
  (`docs/BACKUP_AND_RECOVERY.md`).
