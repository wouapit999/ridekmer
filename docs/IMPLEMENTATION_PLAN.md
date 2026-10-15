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

### Milestone 2 — Owner and vehicle onboarding `[ ]`

- Owner registration and KYC (individual / company), payout details
- Vehicle onboarding wizard with draft saving, photos, documents, ownership model selection
- Document management (configurable types, versions, verification workflow, expiry alerts,
  automatic unavailability, administrator override with reason + audit)
- Vehicle review / approval / suspension in the administration portal
- Owner agreement acceptance (contract package)

### Milestone 3 — Catalogue, search, pricing and booking `[ ]`

- Public catalogue and search with all filters from the brief
- Availability calendar, blocked dates, overlap prevention (DB exclusion constraint)
- Deterministic pricing engine (integer XAF) with tests
- Reservation holds with automatic expiry
- Booking state machine with validated transitions and status history, price snapshots

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
