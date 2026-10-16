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

## ADR-024 Ledger: pure posting rules, idempotent by source, balances derived

- Decision: every money event maps to a list of double-entry lines produced by a pure
  function (`src/features/finance/postings.ts`) that is unit-tested without a database.
  `postLines` writes a set atomically with idempotency keys `<source>:<type>:<index>`, so a
  hook and the catch-up job can both run. Balances are always derived from entries (credits −
  debits); nothing stores a running balance. Owner payable accounts are created on demand.
- Account model: `platform_cash`, `customer_deposits_held`, `platform_revenue`, `tax_payable`,
  `fees_receivable`, `adjustments`, `payout_clearing`, `owner_payable:<ownerProfileId>`.
- Consequences: a business operation never fails because of the ledger (`tryPost` logs
  failures and the cron catches up); corrections are reversing or adjustment entries, never
  edits, because `LedgerEntry` is append-only at the database level.

## ADR-025 Refund and retention splits follow the original commission

- Decision: the rental part of a refund is shared between owner and platform in the same
  proportion as the original earning; retained deposits (damage, fuel, km, late) are credited
  to the owner net of commission. Expenses reduce the owner payable by their allocated share.
- Consequences: owner statements stay explainable line by line; the exact policy for damage
  retention (owner net of commission) is flagged for business confirmation (OPEN_ITEMS).

## ADR-026 Payouts: owner-initiated or finance-initiated, never automatic

- Decision: a payout is requested from the available balance (payable − payouts in flight),
  approved by someone other than the requester (two approvers at or above the threshold),
  executed by a `payout.process` holder through the provider or recorded manually for bank
  transfers, and posted on PAID. No scheduled automatic payouts in v1.
- Consequences: separation of duties mirrors refunds; `super_administrator` deliberately
  lacks `payout.process` so execution needs the finance role.

## ADR-027 Telematics: push contract owned by RideKmer, no vendor pulls until documented

- Decision: the application never depends on pulling a vendor API. Vendors (or an integration
  middleware) push signed JSON events in RideKmer's documented format to
  `/api/webhooks/gps/generic`; the mock provider speaks the same format. The generic REST
  adapter validates its configuration and refuses every pull method with `NOT_IMPLEMENTED`
  until the vendor's official documentation exists. Positions are always read from
  `TrackingEvent`.
- Consequences: no invented vendor endpoints; switching vendors changes a signing secret and a
  middleware mapping, not business code.

## ADR-028 Location data: logged access, mandatory reason, bounded range, retention purge

- Decision: `tracking.view_current` reads log one `VIEW_CURRENT` entry per fleet view;
  `tracking.view_history` and `tracking.export` require a written reason, are capped at 31 days
  per request and are logged with range, IP and user agent. A daily cron deletes events older
  than `tracking.location_retention_days` (setting) or `GPS_LOCATION_RETENTION_DAYS`.
- Consequences: auditors can answer "who looked at this vehicle and why"; customers are never
  shown live tracking of other people; the owner page shows installation and consent only.

## ADR-029 Immobilisation stays an interface; the request workflow exists, the command does not

- Decision: `ImmobilisationRequest` enforces reason → stationary confirmation from the latest
  fix (≤ 10 min, no speed, ignition off, re-checked at execution) → two approvals from users
  other than the requester → provider acknowledgement. `getImmobilisationProvider()` returns
  `null`; execution therefore closes the request as `UNAVAILABLE` and audits that nothing was
  sent. Registering a real provider is a deliberate, reviewed change behind that single hook.
- Consequences: the process and audit trail exist and are tested before any provider does; no
  path in the code can immobilise a vehicle automatically.

## ADR-030 Fleet map without client-side map libraries

- Decision: the admin map renders raster tiles from a configurable template
  (`MAP_TILE_URL_TEMPLATE`, OpenStreetMap by default) inside an SVG with markers and a track
  polyline, as a server component. No third-party script is loaded, so the strict CSP and the
  no-external-JS posture hold.
- Consequences: no pan/zoom interaction (a link opens the area on OpenStreetMap); a paid tile
  provider must be chosen before launch (OPEN_ITEMS) because the OSM public tiles are for
  light use only.

## ADR-031 Deep health check, boot validation and application rate limits

- Decision: `/api/health` stays anonymous for uptime monitors (status + database latency) and
  returns readiness details (pending migrations, storage reachability, payment provider
  modes, cron freshness, production-only warnings) only with the `CRON_SECRET` bearer
  token. `src/instrumentation.ts` validates the environment once per server instance and
  routes every unhandled request error through the redacting logger (`onRequestError`).
  Sensitive customer actions (contact form, payment initiation, booking confirmation,
  incident reports, data export and deletion) go through `src/server/security/rate-limit.ts`:
  Upstash sliding windows in production, an in-memory window elsewhere, failing open on a
  Redis outage.
- Consequences: no configuration detail leaks to anonymous callers; Upstash is mandatory in
  production (already enforced by `getEnv()`); limits are generous because many users share
  carrier-grade NAT addresses, and per-account keys are used whenever the user is signed in.

## ADR-032 Housekeeping job and account deletion by anonymisation

- Decision: a daily `/api/cron/housekeeping` job deletes expired sessions, verification
  tokens, idempotency keys, stale rate-limit rows, old holds, processed webhook payloads and
  old notifications according to `privacy.*` settings, retries failed SMS/e-mail
  notifications (max 3 attempts), and anonymises accounts whose deletion request has passed
  the grace period (`privacy.account_deletion_grace_days`, 30 by default). Deletion replaces
  name, e-mail and phone, clears identity numbers and payout details, deletes identity
  documents from storage, sessions, credentials, push subscriptions and addresses, and sets
  the user to `DELETED`. Bookings, payments, ledger, contracts, inspections and audit rows
  are kept, detached from any identity.
- Consequences: statutory retention is honoured without keeping personal data; a request is
  refused while bookings are in flight, an owner balance is non-zero or vehicles are still
  listed; the grace period lets people change their minds; staff accounts are handled by an
  administrator. Retention periods remain placeholders pending legal review.

## ADR-033 Static public pages with a client-side viewer descriptor

- Decision: the public site layout no longer reads the session. The header fetches
  `/api/account/viewer` (name + staff flag, `private, no-store`) from the browser, so the
  marketing and legal pages are prerendered per locale (`force-static` +
  `generateStaticParams`) and served from the CDN. The home page keeps a database read for
  the city list and is rendered on demand; account, owner, admin and checkout pages stay
  dynamic by design.
- Consequences: faster first paint and far fewer function invocations on the pages that
  receive most traffic; the signed-in state in the header appears a few hundred
  milliseconds after the page, which the tests tolerate; admin and owner layouts still pass
  an explicit viewer so no extra request is made there.

## ADR-034 Service worker strategy

- Decision: a hand-written `public/sw.js` (no Workbox, no build plugin) precaches the two
  offline pages and the manifest, serves hashed static assets cache-first, answers
  navigations network-first with the locale's offline page as fallback, and never touches
  `/api`, authentication, account, owner, admin or checkout routes. A client component
  registers it in production, shows an "update available" prompt (SKIP_WAITING) and an
  offline banner.
- Consequences: no private data is ever written to the cache; no background sync or push
  (deferred); the worker file must have its `CACHE_VERSION` bumped when the offline page
  changes.

## ADR-035 Dependency overrides for unused transitive packages

- Decision: `pnpm.overrides` pins `mysql2` and `deepmerge-ts` to patched versions. Both are
  pulled in by the Prisma CLI only (RideKmer uses the PostgreSQL adapter) and are never
  executed at runtime; the override keeps `pnpm audit --prod --audit-level=high` green in CI
  without forking Prisma. The CI job fails on any new high-severity advisory.
- Consequences: the overrides are reviewed at every Prisma upgrade and removed once Prisma
  ships the patched versions itself.

## ADR-036 Netlify as primary host, Vercel kept as an alternative

- Decision: the Vercel Hobby plan rejects cron schedules more frequent than daily, which the
  booking-hold expiry (5 min) and payment reconciliation (15 min) need. RideKmer therefore
  deploys to Netlify by default: `netlify.toml`, the pinned Next.js adapter, and seven
  scheduled functions (`netlify/functions/cron-*.ts`) that call the unchanged `/api/cron/*`
  routes with the cron secret. `vercel.json` stays in the repository and a unit test keeps
  both schedule lists identical, so switching hosts is a configuration change.
- Consequences: no business logic moved; Vercel-only settings (`maxDuration`,
  `VERCEL_GIT_COMMIT_SHA`) are ignored or have fallbacks (`COMMIT_REF`); synchronous function
  limits on Netlify's free plan (10 s default) make batching and idempotency of the cron
  routes mandatory (already the case); the storage provider must be S3-compatible rather than
  Vercel Blob; scheduled functions never run on previews, so cron behaviour is only testable
  in production or locally with `curl`.

## ADR-037 Railway (single long-running container) as the default host; in-process scheduler

- Decision: after Vercel's Hobby cron limit and the Netlify dashboard friction, RideKmer
  ships a `Dockerfile` and `railway.json` and runs as one Node process on Railway. The seven
  cron jobs live in `src/server/cron/jobs.ts` (shared with the Netlify functions and
  `vercel.json`, kept identical by a unit test) and, when `CRON_MODE=in-process`, an
  in-process scheduler (croner, UTC, overlap protection) calls the application's own cron
  routes with the cron secret. Two production-safety rules gained explicit opt-outs for
  single-replica hosts: `STORAGE_PROVIDER=local` is allowed when `STORAGE_LOCAL_ROOT` points
  to a mounted volume, and `RATE_LIMIT_BACKEND=memory` replaces Upstash. Migrations and the
  reference seed run as Railway's pre-deploy command, never from request handlers.
- Consequences: no function time limits and no framework adapter; the scheduler and the
  memory limiter require exactly one replica (documented; scaling out means Upstash + S3 and
  `CRON_MODE` on a single service); uploads on a volume need their own backup; the image is
  built and validated in CI; Vercel and Netlify stay available through configuration only.

## ADR-038 GitHub Actions as a host-independent scheduler; free-tier deployment paths

- Decision: `.github/workflows/cron.yml` runs the seven schedules (free on the public
  repository) and calls the application's cron routes with the cron secret. It is the
  default scheduler for hosts whose free plans cannot schedule sub-daily jobs (Vercel Hobby)
  or that sleep when idle (Render free), and it works unchanged on any host with
  `CRON_MODE=external`. `vercel.json` carries no cron schedules anymore so the Hobby import
  succeeds. `render.yaml` describes the free Render web service built from the Dockerfile.
  `docs/FREE_HOSTING.md` documents the two fully free paths (Vercel Hobby + Neon + Blob,
  Render free + Neon + R2).
- Consequences: schedules are enforced by GitHub (runs may lag by a few minutes; GitHub
  pauses schedules after 60 days without repository activity, re-enabled with one click);
  two repository secrets are required; the schedule table now has four consumers kept in
  sync by one unit test (jobs table, GitHub workflow, Netlify functions, optional Vercel).

## ADR-039 Real e-mail adapters and a one-shot administrator bootstrap

**Context.** The log e-mail provider was the only implementation, so the first administrator
had to be promoted with SQL and nobody could receive a password-reset or verification mail.
Setting up the production database from a personal Windows machine also proved fragile.

**Decision.**

- `@ridekmer/notifications` gains `ResendEmailProvider` (HTTP API, no SDK) and
  `SmtpEmailProvider` (nodemailer). `getEmailProvider()` picks them from `EMAIL_PROVIDER`
  plus their credentials and falls back to the log provider, which `/api/health` reports.
- `bootstrapSuperAdmin()` (`src/server/auth/bootstrap-admin.ts`) applies the reference data,
  creates the account with a scrypt hash from Better Auth's own `hashPassword`, grants
  `super_administrator`, audits the action and e-mails a 20-character temporary password
  (template `admin_credentials`, body never persisted). It refuses when an administrator
  already exists and grants the role to an existing account instead of creating a second one.
- Exposed three ways with the same code path: `POST /api/admin/bootstrap` behind the cron
  secret, the manual **Database** GitHub workflow (migrate, seed, bootstrap; Neon reachable
  from the runner) and `pnpm admin:bootstrap` for operators with a terminal.
- Sign-up no longer fails when the verification e-mail cannot be sent, and the register
  form shows the server's reason next to the generic message.

**Consequences.** A password travelling by e-mail is weaker than a set-password link; it is
accepted for the single bootstrap because the account must change it and enable TOTP
before the administration area opens, and the mail tells the recipient to delete it
(OPEN_ITEMS #72). Without a configured provider the password is returned once to the
holder of the cron secret, which is why the workflow prints the outcome but never the body.
