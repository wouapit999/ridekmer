# Deployment

## Environments

| Environment | Branch                   | Database                                     | Providers           | Demo data                          |
| ----------- | ------------------------ | -------------------------------------------- | ------------------- | ---------------------------------- |
| Development | local                    | local PostgreSQL                             | log / mock          | allowed                            |
| Preview     | any non-main branch / PR | separate preview database                    | mock / sandbox only | allowed (never real customer data) |
| Production  | `main`                   | production PostgreSQL (pooled + direct URLs) | real, once approved | **refused**                        |

Preview deployments must never receive production credentials or customer data; Vercel keeps
environment variables per environment.

## Build

`pnpm build` = `prisma generate && next build`. `postinstall` also generates the Prisma client
so type checks work right after install. The generated client is git-ignored.

## Database migrations (controlled, never automatic in functions)

Migrations are applied by an operator or a CI step, **never** by serverless function code:

```bash
# from a machine/CI with network access to the database
DIRECT_DATABASE_URL="postgresql://…direct…" pnpm db:migrate:deploy
pnpm db:migrate:status        # must print "Database schema is up to date!"
```

Rules:

1. Run migrations **before** promoting a deployment that depends on them. Migrations are
   written to be backwards compatible with the previous release (expand → migrate → contract).
2. Destructive changes (dropping columns/tables, data deletion) are never part of a routine
   deployment; they require a backup, a maintenance window and an ADR.
3. `prisma migrate deploy` only applies committed migrations; `migrate dev` and `db push` are
   forbidden against preview/production.
4. Separate pooled (`DATABASE_URL`) and direct (`DIRECT_DATABASE_URL`) connections: Neon and
   Supabase poolers do not support the session features migrations need.
5. After migrating, seed reference data idempotently: `ALLOW_DEMO_SEED=false pnpm db:seed`.

Optional automation: a GitHub Actions `deploy-migrations.yml` workflow (manual
`workflow_dispatch`, environment-protected secret `DIRECT_DATABASE_URL`) can run the same two
commands; it is intentionally not added until the production database exists.

## Vercel deployment checklist

- [ ] GitHub repository connected (`wouapit999/ridekmer`)
- [ ] Root directory `.`; framework Next.js detected
- [ ] Build `pnpm build`; install `pnpm install --frozen-lockfile`; Node 22
- [ ] Environment variables set per environment (see `docs/VERCEL_SETUP.md`)
- [ ] Database reachable (`/api/health`)
- [ ] Migrations applied and status clean
- [ ] Reference data seeded, demo data disabled in production
- [ ] Custom domain + DNS + HTTPS
- [ ] Preview deployment verified (both languages, login, admin)
- [ ] Production deployment verified
- [ ] Rollback procedure tested once (promote previous deployment)
- [ ] Function logs reviewed for errors after deploy
- [ ] Payment webhook URLs registered (when providers are live)
- [ ] Cron schedule `/api/cron/document-expiry` visible in Vercel → Settings → Cron Jobs and `CRON_SECRET` set
- [ ] `STORAGE_PROVIDER=vercel-blob` (or `s3`) configured; a test upload from the owner wizard succeeds and opens through a signed URL

## Rollback

Code: promote the previous deployment in Vercel. Database: migrations are forward-only; to
undo, write a new migration that reverses the change, or restore from backup
(`docs/BACKUP_AND_RECOVERY.md`).

## Post-deployment smoke test

`/api/health`, `/fr`, `/en`, login with a real staff account (MFA), `/fr/admin`,
`/fr/cars?city=douala`, contact form submission (creates a `SupportCase`).
