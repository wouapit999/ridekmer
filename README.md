# RideKmer

**RideKmer** is a bilingual (French / English), mobile-first car-rental, vehicle-leasing and
fleet-management platform for Cameroon. It connects customers with vehicles owned by RideKmer,
vehicles entrusted by private or corporate owners, marketplace vehicles managed by their
owners, chauffeur-driven vehicles and long-term rentals.

> Status: **Milestones 1–8 complete (feature-complete v1, mock integrations)** — see
> `docs/IMPLEMENTATION_PLAN.md` for what each milestone delivered,
> `docs/PRODUCTION_READINESS_CHECKLIST.md` for what still separates this code from a launch,
> and `docs/OPEN_ITEMS.md` for everything that needs a decision, a contract or credentials.

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS 4 · Prisma 7 +
PostgreSQL · Better Auth (email/password, phone OTP, TOTP MFA) · next-intl · Zod · Vitest ·
Playwright · pnpm workspace · GitHub Actions · Vercel.

## Repository layout

| Path           | Purpose                                                                           |
| -------------- | --------------------------------------------------------------------------------- |
| `src/app`      | App Router routes (`[locale]/…`, `api/…`)                                         |
| `src/features` | Feature modules (auth, account, admin, vehicles, contact)                         |
| `src/server`   | Server-only code: database client, auth, RBAC, audit, notifications               |
| `src/lib`      | Framework-agnostic helpers (money, dates, phone, crypto, env, logger)             |
| `src/messages` | `en.json` / `fr.json` translation catalogues                                      |
| `packages/*`   | Provider-agnostic packages: payments, notifications, storage, tracking, contracts |
| `prisma/`      | Schema, migrations, seed (reference data + guarded synthetic demo data)           |
| `tests/`       | `unit/`, `integration/` (PostgreSQL), `e2e/` (Playwright)                         |
| `docs/`        | Architecture, operations, deployment, legal and security documentation            |

## Quick start

```bash
corepack enable && pnpm install
cp .env.example .env               # edit DATABASE_URL / DIRECT_DATABASE_URL / secrets
pnpm db:migrate                    # apply migrations (development)
pnpm db:seed                       # reference data; demo accounts only if ALLOW_DEMO_SEED=true
pnpm dev                           # http://localhost:3000 → /fr
```

Synthetic demo accounts (never created in production) are listed in
`prisma/seed-data/demo.ts`; the shared password is printed by the seed.

## Scripts

| Command                  | What it does                                                     |
| ------------------------ | ---------------------------------------------------------------- |
| `pnpm check`             | format:check + lint + typecheck + unit tests + production build  |
| `pnpm test`              | Unit tests (Vitest)                                              |
| `pnpm test:integration`  | Integration tests against `TEST_DATABASE_URL` (migrates + seeds) |
| `pnpm test:e2e`          | Playwright tests (expects a built app and seeded database)       |
| `pnpm db:migrate`        | `prisma migrate dev` (development only)                          |
| `pnpm db:migrate:deploy` | `prisma migrate deploy` (CI / production, non-destructive)       |
| `pnpm db:seed`           | Seed reference data (+ demo data outside production)             |
| `pnpm build`             | `prisma generate && next build`                                  |

## Documentation

Start with `docs/ARCHITECTURE.md`, then `docs/DEPLOYMENT.md` and `docs/VERCEL_SETUP.md` for
hosting. Security: `SECURITY.md`, `docs/SECURITY.md`, `docs/PRIVACY.md`. Integrations:
`docs/PAYMENT_INTEGRATION.md`, `docs/GPS_INTEGRATION.md`, `docs/BACKGROUND_JOBS.md`.
Legal items requiring professional validation: `docs/LEGAL_REVIEW_CHECKLIST.md`.

## Important notices

- Payment providers (MTN Mobile Money, Orange Money, card) are **development mocks** until
  merchant credentials and provider approval exist. Nothing here claims a live integration.
- GPS tracking uses a **mock provider**; a generic REST provider shell is planned for
  Milestone 7. Consumer tags (AirTag / SmartTag) are secondary recovery devices only.
- Legal texts on the public site are **placeholders** pending review by qualified Cameroonian
  counsel. This repository does not provide legal advice.
- No licence has been chosen yet (`LICENSE` is a placeholder requiring a decision).
