# Contributing to RideKmer

## Prerequisites

- Node.js 22 (see `.nvmrc`), pnpm 10 (`corepack enable`)
- PostgreSQL 16 (local or Docker: `docker run -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16`)

## Getting started

```bash
cp .env.example .env            # then edit DATABASE_URL etc.
pnpm install
pnpm db:migrate                 # applies migrations to DATABASE_URL (dev)
pnpm db:seed                    # reference data (+ synthetic demo data if ALLOW_DEMO_SEED=true)
pnpm dev                        # http://localhost:3000 → redirects to /fr
```

Demo accounts (non-production only) are listed in `prisma/seed-data/demo.ts`.

## Branch model

- `main` — production. Protected; deploys to Vercel production.
- `develop` — integration branch; deploys to a Vercel preview.
- `feature/<short-name>` — one feature per branch, PR into `develop`.
- `hotfix/<short-name>` — urgent fixes, PR into `main` and back-merged into `develop`.

See `docs/GITHUB_WORKFLOW.md`.

## Before opening a pull request

```bash
pnpm check                      # format:check, lint, typecheck, unit tests, build
pnpm test:integration           # needs TEST_DATABASE_URL
pnpm test:e2e                   # needs a built app + seeded database
```

## Conventions

- **Money**: integer XAF only (`src/lib/money.ts`). Percentages in basis points.
- **Time**: compute business days in `Africa/Douala` (`src/lib/dates.ts`); store UTC.
- **Translations**: every user-facing string lives in `src/messages/{en,fr}.json`; a unit test
  enforces key parity.
- **Authorisation**: call `requirePermission*` / `assertPermission` in every server action and
  route handler. UI gating alone is never sufficient.
- **Audit**: use `recordAudit()` for any privileged or financial mutation.
- **Migrations**: `pnpm db:migrate --name <change>`; commit the generated SQL; never edit an
  applied migration. Hand-written SQL (constraints, triggers) is allowed inside migrations.
- **Providers**: external services go behind the interfaces in `packages/*`; never import a
  vendor SDK from business logic.
- **Commits**: imperative, scoped messages, e.g. `booking: prevent overlapping holds`.
