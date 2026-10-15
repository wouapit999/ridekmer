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

### Milestone 4 — Payments `[x]`

- [x] `@ridekmer/payments`: provider shells (MTN MoMo, Orange Money, card) that validate config
      and refuse to run until implemented from official docs; manual providers (bank transfer,
      cash); hardened mock (signed webhooks, amount semantics, restart-safe)
- [x] Registry resolving providers from the environment; mocks refused in production
- [x] Payment service: idempotent initiation per booking, attempts, status polling, webhook
      ingestion with signature + replay + window checks, `verifyTransaction` gate, single
      confirmation path, manual recording/confirmation, reconciliation cron (every 15 min)
- [x] Refunds with separation of duties and dual approval; automatic refund request on
      cancellation of a paid booking
- [x] Customer pay page (method choice, Mobile Money number, live status, mock controls in
      non-production), admin payments list/detail (attempts, provider events, refunds), refund
      queue, manual payment recording on the booking page
- [x] Admin payment configuration page: typed method/rule settings and per-provider
      environment, base URL and encrypted credentials with validation (overrides env vars)
- [x] Tests: package unit tests (shells, manual, mock), integration (webhook pipeline, replay /
      forged / stale / mismatch, retry after decline, manual payment, expiry + reconciliation,
      refund approvals), e2e (pay with the simulated MTN provider)

### Milestone 5 — Contracts, inspections, incidents, maintenance `[x]`

- [x] Customer rental agreement template (FR/EN, placeholder wording pending counsel), generated
      and frozen (markdown + SHA-256) at booking confirmation, click-to-accept with evidence
      (IP, user agent, timestamp, checksum) — explicitly not a certified signature
- [x] Admin contracts page: template versions (publish new, immutable history), generated list
- [x] Inspections: pickup / return / periodic drafts with mileage, fuel, checklists, photos
      (private storage, checksum, ≥ 4 required), damages on RideKmer's own outline diagram,
      submission freezes the record and updates vehicle mileage; customer acknowledges or disputes
- [x] Return settlement (pure integer function): extra km, fuel, new damage, late days → deduction;
      deposit release opens the refund request (dual approval) and records additional charges
- [x] Handover gates in the booking state machine: ACTIVE needs an accepted agreement and a
      submitted pickup inspection; COMPLETED needs a return inspection; audited override
- [x] Incidents: customer or staff report with photos, reference, status machine with history,
      responsibility/resolution fields, insurance claims, optional vehicle block, notifications
- [x] Maintenance: schedules (days/km, reminders), records with owner approval above the vehicle's
      threshold, availability block while in progress (refused over confirmed bookings), expense
      on completion, schedule roll-forward; owner view + approval
- [x] Hourly operations cron: pickup/return reminders, late-return detection, maintenance reminders
- [x] Tests: settlement (unit); contract gating, inspections, settlement, incidents, maintenance,
      reminders (integration)

### Milestone 6 — Ledger, statements, payouts, finance dashboards, reports `[x]`

- [x] Double-entry ledger: pure posting rules (rental payment, additional charge, refund,
      deposit retention, expense, payout, manual adjustment), idempotent writes keyed by
      source, owner payable accounts created on demand, balances from the ledger
- [x] Hooks on payment success, refund completion, deposit settlement, expense allocation and
      payout payment; catch-up job in the reconciliation cron and the monthly statements cron
- [x] Owner statements: frozen monthly summary with running-balance lines, issued by cron on
      the 1st or on demand; owner view + CSV download
- [x] Payouts: owner or finance request from the available balance, approver ≠ requester,
      dual approval above the threshold, execution through the payment provider (mock Mobile
      Money) or manual bank transfer marked paid with a reference, ledger posting, notifications
- [x] Expense allocation by finance (owner / RideKmer / shared / customer) with posting
- [x] Finance dashboard (monthly KPIs, owner balances, recent entries), ledger browser with
      adjustments, payouts and expenses queues, reports page with audited CSV exports
      (formula-injection safe)
- [x] Tests: posting rules and statement maths (unit); payment → settlement → refund →
      expense → payout → statement flow (integration)

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
