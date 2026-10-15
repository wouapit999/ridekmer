# RideKmer — Implementation Plan

RideKmer is a bilingual (French / English), mobile-first car-rental, vehicle-leasing and
fleet-management platform for Cameroon. This document is the working plan for building it as a
modular monolith on Next.js, deployed to Vercel from the GitHub repository `wouapit999/ridekmer`.

Status legend: `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked (see
`docs/OPEN_ITEMS.md`).

## 1. Repository findings (inspection, 2026-10-15)

- The Claude Code session was started inside the GitHub **profile** repository
  `wouapit999/wouapit999` (a single `README.md`), on branch `claude/clever-hamilton-yn2ghh`.
- No `wouapit999/ridekmer` repository exists on the account.
- The GitHub CLI token in the session is invalid, and the session's GitHub write scope is
  limited to `wouapit999/wouapit999`. The repository therefore **cannot be created from this
  session** without fabricating a result. The application is developed on the designated
  branch and the owner runs the commands in `docs/GITHUB_WORKFLOW.md` §"Moving the code into
  `wouapit999/ridekmer`" to create the real repository (a few minutes of work).
- Toolchain available: Node 22.22, pnpm 10.28, Git 2.43, PostgreSQL 16 (local, used for
  migrations and integration tests), Chromium/Playwright.

## 2. Project structure

```
ridekmer/                      (repository root = Vercel root directory)
├── .github/                   CI workflow, issue/PR templates, CODEOWNERS
├── docs/                      architecture, operations and legal documentation
├── packages/                  provider-agnostic workspace packages (pure TypeScript)
│   ├── payments/              @ridekmer/payments  — payment provider interfaces + mocks
│   ├── notifications/         @ridekmer/notifications — email/SMS/WhatsApp/in-app/push
│   ├── storage/               @ridekmer/storage   — private object storage abstraction
│   ├── tracking/              @ridekmer/tracking  — GPS/telematics provider abstraction
│   └── contracts/             @ridekmer/contracts — contract templating + checksums
├── prisma/                    schema.prisma, migrations/, seed.ts
├── public/                    static assets, PWA icons
├── scripts/                   operational scripts (migrate, check-env, …)
├── src/
│   ├── app/                   Next.js App Router ([locale]/… routes, api/…)
│   ├── components/            shared UI (accessible primitives, layout)
│   ├── features/              feature modules (auth, vehicles, bookings, …)
│   ├── i18n/                  next-intl routing + request config
│   ├── lib/                   framework-agnostic helpers (money, dates, phone, env, logger)
│   ├── messages/              en.json, fr.json translation catalogues
│   ├── server/                server-only code (db, auth, rbac, audit, services)
│   ├── styles/                global CSS / design tokens
│   └── types/                 shared TypeScript types
├── tests/
│   ├── unit/                  Vitest unit tests
│   ├── integration/           Vitest tests against PostgreSQL
│   └── e2e/                   Playwright tests
├── .env.example
├── next.config.ts
├── prisma.config.ts
├── package.json               package name: ridekmer (app name shown to users: RideKmer)
└── pnpm-workspace.yaml
```

`vercel.json` is only added when needed (cron schedules — see `docs/BACKGROUND_JOBS.md`).

## 3. Milestones

### Milestone 1 — Foundation `[x]` (2026-10-15)

- [x] Inspect repository and toolchain
- [x] Architecture documents (this plan, assumptions, decisions)
- [x] Next.js 16 App Router application, TypeScript strict, Tailwind CSS 4
- [x] pnpm workspace with `packages/*`
- [x] Prisma 7 + PostgreSQL (driver adapter, `prisma.config.ts`, pooled vs direct URLs)
- [x] Complete first-version Prisma schema (all models listed in the brief) + initial migration
- [x] Seed: roles, permissions, cities (Douala, Yaoundé), branches, document types, system
      settings, notification templates; demo accounts guarded against production
- [x] Authentication: Better Auth (email + password, phone OTP, TOTP MFA for staff)
- [x] Roles + granular permissions enforced server-side, audit log helper
- [x] Localisation: next-intl, `fr` default + `en`, XAF/number/date formatting, Africa/Douala
- [x] Public shell: home, how it works, partner, chauffeur, corporate, long-term, FAQ,
      contact, privacy, terms/rental/cancellation placeholders
- [x] Auth pages, account area, admin shell with permission gates
- [x] PWA manifest + icons (service worker in Milestone 8)
- [x] Security headers + CSP baseline
- [x] GitHub Actions CI, PR/issue templates, CODEOWNERS, SECURITY.md, CONTRIBUTING.md, LICENSE
- [x] Full documentation set (see §5)
- [x] `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build` green
- [x] Commit + push (branch `claude/clever-hamilton-yn2ghh` of `wouapit999/wouapit999`; migration to `wouapit999/ridekmer` pending — docs/GITHUB_WORKFLOW.md)

### Milestone 2 — Owner and vehicle onboarding `[x]` (2026-10-15)

- [x] Owner onboarding wizard with draft progress: profile (individual / company), payout
      details (encrypted bank account), KYC documents, owner agreement (immutable generated
      contract + click-to-accept evidence)
- [x] Vehicle onboarding wizard (8 steps, draft saving): basics, equipment, location,
      pricing, photos, documents, management arrangement (fully managed / self-managed with
      responsibility matrix), review and submit with completeness validation
- [x] Document management: configurable types (admin editor), versioned uploads, verify /
      reject with reason, expiry alerts at 60/30/14/7/0 days (cron), automatic
      `UNAVAILABLE_DOCUMENTS`, administrator override with reason + expiry + audit
- [x] Private file storage: Vercel Blob / S3 adapters, dev local provider, validation,
      checksums, short-lived signed URLs, sensitive-access audit
- [x] Vehicle review workflow: list by status, detail with documents/photos, start review,
      approve (requires verified mandatory documents) and publish, reject, suspend,
      reinstate, withdraw; owner suspension/withdrawal requests; blocked dates
- [x] Customer identity + driving-licence upload and verification queue (customer/owner/KYB)
- [x] Cron route `/api/cron/document-expiry` + `vercel.json` schedule
- [x] Tests: lifecycle + schema unit tests, onboarding/approval/expiry integration test,
      full owner → admin e2e flow

### Milestone 3 — Catalogue, search, pricing and booking `[x]` (2026-10-15)

- [x] Public catalogue: search results with photos (signed URLs), vehicle detail page with
      specifications, prices, unavailable dates and a quote widget
- [x] Deterministic pricing engine (integer XAF): daily path with weekend/seasonal
      multipliers vs weekly/monthly packages, long-duration discounts, chauffeur, delivery,
      return collection, additional drivers, promo codes (caps, minimums, per-user limits),
      service fee, tax, commission and owner share; cancellation and late-return fees
- [x] Availability: advance-notice and duration rules, overlap checks against bookings,
      blocks and foreign holds; public unavailable ranges
- [x] Reservation holds: per-user hold created at checkout (vehicle row lock + exclusion
      constraint), refreshed on revisit, expired by cron every 5 minutes together with unpaid
      bookings past their payment deadline
- [x] Booking state machine with explicit transitions, status history, immutable price
      snapshots (one per re-quote), customer cancellation policy, extension requests,
      `confirmBookingAfterPayment` for Milestone 4, staff transitions by permission
- [x] Checkout, customer bookings list/detail, admin bookings list/detail
- [x] Tests: pricing engine, state machine and window rules (unit); quotes, holds,
      concurrent booking prevention, lifecycle, cancellation, expiry (integration);
      customer booking and double-booking prevention (e2e)

### Milestone 4 — Payments `[ ]`

- `@ridekmer/payments` interfaces, MTN MoMo / Orange Money / card / bank transfer / cash shells
- Development mock providers, idempotency, webhook signature + replay protection
- Server-side confirmation only, reconciliation job

### Milestone 5 — Contracts, inspections, incidents, maintenance `[ ]`

### Milestone 6 — Ledger, statements, payouts, finance dashboards, reports `[ ]`

### Milestone 7 — GPS / telematics abstraction, fleet map, geofences, access audit `[ ]`

### Milestone 8 — Hardening, accessibility, performance, PWA, full test-suite, readiness `[ ]`

## 4. Working method

1. Small, testable increments; each milestone ends with the full check run and a commit.
2. Money is always an integer number of XAF. Never floats.
3. All times are computed in `Africa/Douala`; the database stores UTC timestamps.
4. All user-facing strings go through translation keys with `en` and `fr` catalogues kept in
   parity (a unit test enforces it).
5. Every privileged server operation calls `requirePermission()`; UI gating is cosmetic only.
6. External integrations are never claimed to work unless configured and tested; mock
   providers are clearly labelled.
7. Unresolved items go to `docs/OPEN_ITEMS.md`, decisions to `docs/DECISIONS.md`.

## 5. Documentation set

README.md, SECURITY.md, CONTRIBUTING.md and `docs/`: ARCHITECTURE, IMPLEMENTATION_PLAN,
ASSUMPTIONS, DECISIONS, OPEN_ITEMS, DATA_MODEL, API, AUTHENTICATION, SECURITY, PRIVACY,
PAYMENT_INTEGRATION, GPS_INTEGRATION, BACKGROUND_JOBS, GITHUB_WORKFLOW, VERCEL_SETUP,
DEPLOYMENT, BACKUP_AND_RECOVERY, OPERATIONS_RUNBOOK, LEGAL_REVIEW_CHECKLIST,
PRODUCTION_READINESS_CHECKLIST.
