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
