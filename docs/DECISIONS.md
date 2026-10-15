# Architecture Decision Records

Short ADRs. Newest at the bottom. Format: context → decision → consequences.

## ADR-001 Modular monolith on Next.js App Router

- Context: one small team, Vercel deployment target, many bounded domains.
- Decision: a single Next.js 16 application with feature modules under `src/features` and
  `src/server`, plus pure-TypeScript workspace packages for provider abstractions
  (`packages/*`). No microservices for v1.
- Consequences: one deployment, shared Prisma client, simple transactions. Packages keep
  vendor code out of business logic and can be extracted later.

## ADR-002 pnpm workspace with the app at the repository root

- Context: the brief suggests `src/` and `packages/` side by side; Vercel detects Next.js at
  the root directory.
- Decision: the root `package.json` is the `ridekmer` Next.js app; `packages/*` are
  workspace packages consumed as TypeScript source via `transpilePackages`.
- Consequences: no build step for packages; Vercel root directory stays `.`.

## ADR-003 Prisma 7 with the PostgreSQL driver adapter

- Context: Prisma 7 is the current major (engine-less client, `prisma.config.ts`, driver
  adapters required). Managed PostgreSQL providers need pooled runtime connections and direct
  migration connections.
- Decision: Prisma 7 + `@prisma/adapter-pg`. `DATABASE_URL` (pooled) is used at runtime;
  `DIRECT_DATABASE_URL` is used by the CLI for migrations via `prisma.config.ts`. The client
  is generated into `src/generated/prisma` (git-ignored) by `prisma generate` during
  `pnpm build`/`postinstall`.
- Consequences: migrations are an explicit deployment step (`pnpm db:migrate:deploy`) and are
  never run from request handlers.

## ADR-004 Better Auth for authentication

- Context: the brief allows Auth.js "or another well-supported solution". Requirements
  include phone OTP registration, email + password, and MFA for privileged roles. Auth.js
  Credentials provider is JWT-only and has no first-class MFA; Better Auth ships email/
  password (scrypt hashing), a phone-number OTP plugin, a TOTP two-factor plugin, database
  sessions, rate limiting and a Prisma adapter, and runs on Vercel.
- Decision: Better Auth with Prisma adapter, database sessions, `twoFactor` (TOTP + backup
  codes) and `phoneNumber` plugins. OTP delivery goes through `@ridekmer/notifications`.
  Raw OTP values are never stored (Better Auth stores them hashed in `Verification`, and we
  never log them).
- Consequences: MFA is **enforced** by RideKmer's own guard for staff roles (`requireMfaFor
Staff`) on top of Better Auth. Authorisation (roles/permissions) is entirely RideKmer's own
  tables (`Role`, `Permission`, `UserRole`, `RolePermission`), not Better Auth's admin plugin.

## ADR-005 next-intl with locale-prefixed routes

- Decision: `fr` (default) and `en` under `/{locale}/…`, catalogues in `src/messages`,
  `Africa/Douala` as the formatting time zone, XAF formatted with `Intl.NumberFormat`.
- Consequences: a unit test enforces key parity between `en.json` and `fr.json`.

## ADR-006 Money as integers, prices snapshotted

- Decision: every monetary column is `Int` (XAF has no minor unit). Booking totals are
  stored in an immutable `BookingPriceSnapshot`; financial facts live in append-only
  `LedgerEntry` rows. No floating point anywhere in money calculations.

## ADR-007 Background jobs = Vercel Cron + webhooks, no in-function worker

- Decision: scheduled tasks (hold expiry, document-expiry alerts, reconciliation, reminders)
  are route handlers under `/api/cron/*` authenticated with `CRON_SECRET`, scheduled from
  `vercel.json`. A traditional BullMQ worker is **not** deployed on Vercel. An external worker
  is documented as a future option in `docs/BACKGROUND_JOBS.md`.

## ADR-008 Booking overlap prevention at the database level

- Decision: besides application checks inside a transaction, a PostgreSQL `btree_gist`
  exclusion constraint on `(vehicleId, tstzrange(startAt, endAt))` for blocking booking
  statuses and for reservation holds (added in Milestone 3's migration). Prisma cannot
  express it, so it lives in hand-written SQL in the migration.

## ADR-009 Private storage with short-lived signed URLs

- Decision: `@ridekmer/storage` exposes `put`, `getSignedReadUrl`, `delete`, `checksum`;
  implementations for Vercel Blob (private) and S3-compatible; a local-disk implementation is
  for development only and refuses to run in production.

## ADR-010 Telematics: generic commercial provider; consumer tags as secondary only

- Decision: `@ridekmer/tracking` defines `TrackingProvider` (device registry, last location,
  trip history, webhook ingestion). Mock and generic-REST providers ship first. AirTag /
  SmartTag are modelled as `SECONDARY_RECOVERY_TAG` devices with no live integration claimed.
  No remote immobilisation is implemented; only an interface with dual-approval requirements.

## ADR-011 Development source control

- Decision: this session develops on branch `claude/clever-hamilton-yn2ghh` of
  `wouapit999/wouapit999` because that is the only repository the session can write to. The
  target repository `wouapit999/ridekmer` must be created by the owner; the exact commands are
  in `docs/GITHUB_WORKFLOW.md`. Branch model: `main` (production), `develop` (integration),
  `feature/*`.

## ADR-012 Uploads through server actions in v1

- Context: Vercel serverless requests are limited to roughly 4.5 MB; document scans and
  phone photos fit, large originals do not.
- Decision: v1 uploads go through server actions (`bodySizeLimit` 12 MB locally, enforced to
  `STORAGE_MAX_FILE_SIZE_BYTES` ≤ 4 MB on Vercel) so that validation, malware-scan hook,
  checksum and audit run server-side in one place. Direct-to-storage client uploads with
  signed tokens are planned for Milestone 8 (OPEN_ITEMS #32).
- Consequences: simple, fully audited pipeline now; larger files need the later change.

## ADR-013 Document expiry handled by a daily cron, not request-time checks only

- Decision: `processDocumentExpiry` runs daily (Vercel Cron). It marks expired documents,
  sends threshold alerts once each (recorded in `lastAlertDaysBefore` and deduplicated
  notifications) and recomputes `Vehicle.documentsValid`/status. Uploads, reviews and
  overrides also trigger `recomputeVehicleCompliance` immediately so the catalogue never
  shows a vehicle with missing mandatory documents between runs.

## ADR-014 Pricing: "best of" daily path vs package path, then fees

- Context: owners set daily, weekly and monthly rates; seasonal/weekend multipliers and
  long-duration discounts must coexist without ambiguous outcomes.
- Decision: base rental = min(sum of per-day prices with multipliers, package price built from
  28-day and 7-day blocks, never above daily × days). Long-duration discount applies to the
  base; chauffeur, delivery, collection, additional drivers and add-ons are added; promo codes
  discount base + chauffeur only (capped); the service fee is a percentage of the subtotal and
  tax is applied after the fee. Commission is taken on base − discounts + chauffeur; delivery
  and service fees belong to the platform. Every amount is an integer XAF (`applyBps`).
- Consequences: explainable breakdown lines persisted in the snapshot; changes to the rules
  bump `PRICING_VERSION` so old snapshots stay interpretable.

## ADR-015 Holds and bookings are serialised per vehicle

- Decision: hold creation and booking creation run in a transaction that first locks the
  vehicle row (`SELECT … FOR UPDATE`), re-checks bookings, blocks and other users' active
  holds, and relies on the exclusion constraints as the last line of defence. A customer's own
  hold is reused and refreshed; a booking converts it. Holds expire after
  `booking.hold_minutes`, unpaid bookings after `booking.payment_timeout_minutes` (cron).
- Consequences: two concurrent checkouts for the same window always yield exactly one
  booking (covered by an integration test). Holds are never shown publicly.

## ADR-016 Bookings wait for a verified payment; no confirmation from redirects

- Decision: `createBooking` leaves the booking in `PAYMENT_PENDING` (or
  `PENDING_VERIFICATION` for unverified self-drive customers). Only
  `confirmBookingAfterPayment`, invoked by the Milestone 4 payment verification/webhook
  pipeline, or a staff member holding `booking.override` with a recorded reason, moves it to
  `CONFIRMED`.

## ADR-017 One provider transaction per checkout, deposit tracked as a component

- Context: Mobile Money has no pre-authorisation; every push request costs the customer a
  confirmation on their phone. Asking for two approvals (rental, then deposit) would roughly
  double abandonment.
- Decision: checkout collects **one** transaction for `totalRentalXaf + securityDepositXaf`.
  `Payment.depositXaf` records the deposit component so refunds after return and the ledger
  (Milestone 6) can separate it. The deposit is described everywhere as a real debit refunded
  after the return inspection, never as a hold. A separately collected deposit (e.g. cash at
  pickup) uses `PaymentPurpose.SECURITY_DEPOSIT`.
- Consequences: partial refunds target the deposit component; the price snapshot stays the
  source of truth for the rental/deposit split.

## ADR-018 Webhooks are evidence, verification is the decision

- Decision: a provider callback never confirms a booking by itself. `ingestPaymentWebhook`
  persists the event (unique provider event id → replay rejected), checks the adapter's
  signature result, rejects events outside `PAYMENT_WEBHOOK_REPLAY_WINDOW_SECONDS`, then calls
  `verifyTransaction(reference, expectedAmount)`; only an exact status **and amount** match
  reaches `applySuccessfulPayment`, the single path that confirms a booking from a payment.
  Status polling (customer "check status", reconciliation cron) goes through the same gate.
- Consequences: a forged or truncated webhook can at most create an IGNORED/FAILED event row;
  a provider amount mismatch leaves the payment open with `failureCode=AMOUNT_MISMATCH` for
  finance review. Webhook routes answer 401 for bad signatures, 400 for malformed bodies, 200
  for duplicates (so providers stop retrying) and 500 only on internal failure.

## ADR-019 Real providers are shells until credentials exist; mocks never run in production

- Decision: `MtnMomoProvider`, `OrangeMoneyProvider` and `CardProvider` validate their
  configuration and refuse every operation with `NOT_IMPLEMENTED` until implemented from the
  providers' official documentation. No endpoint or payload is guessed. In development and
  preview the registry substitutes `MockPaymentProvider` (labelled `environment: "mock"` in
  the UI and admin). In production a `mock` environment makes the method **unavailable**
  rather than simulated, so no booking can ever be confirmed by a fake payment.
- Consequences: bank transfer and cash are the only production-ready methods today; both are
  manual, confirmed by `payment.record_manual` holders and audited.

## ADR-020 Refunds: separation of duties, dual approval above the threshold

- Decision: every refund is a `Refund` row in `PENDING_APPROVAL`; approvers must hold
  `refund.approve` and differ from the requester; amounts at or above
  `finance.dual_approval_threshold_xaf` need two distinct approvers (`Approval` rows). Money
  moves only in `executeRefund`, after the last approval. Cancelling a paid booking opens the
  refund request automatically (net of the cancellation fee) but never executes it.
- Consequences: finance keeps control of outflows; manual-method refunds stay `PROCESSING`
  until a finance user records the bank/cash reference.

## ADR-021 Handover gates: agreement + inspections before the keys, audited overrides

- Decision: a booking only becomes `ACTIVE` when the customer has accepted the rental
  agreement (click-to-accept with evidence, ADR in ASSUMPTIONS §7) and a pickup inspection with
  at least four photos has been submitted; it only becomes `COMPLETED` after a submitted return
  inspection. `booking.override` holders can bypass the gates, and the override is written into
  the audit log with the reason.
- Consequences: every rental has a frozen contract copy (checksum) and a photographed condition
  report on both ends, which is what disputes and deposit deductions are judged on.

## ADR-022 Return settlement is a pure function; money moves only through approvals

- Decision: `computeSettlement` turns the pickup/return readings into explainable integer lines
  (extra km, fuel, new damage estimates, late days with a one-hour grace) and a deduction. The
  deposit release (`settleReturnDeposit`) opens a refund request for the deposit net of the
  deduction (finance approves, dual approval above the threshold) and records any excess as an
  `ADDITIONAL_CHARGE` payment to collect. Nothing is debited or refunded automatically.
- Consequences: customers see the same lines as finance; disputes are recorded on the inspection
  and reviewed by people.

## ADR-023 Maintenance downtime is an availability block, never an automatic status change

- Decision: starting maintenance creates a `MAINTENANCE` availability block for the downtime
  window (refused when a confirmed booking overlaps); completion closes the block, records an
  `Expense` (owner- or RideKmer-allocated for the ledger in Milestone 6) and rolls the matching
  schedule forward by interval. The vehicle status is untouched, so document compliance and
  owner requests keep their own semantics.
