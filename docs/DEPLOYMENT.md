# Deployment

## Environments

| Environment | Branch                   | Database                                     | Providers           | Demo data                          |
| ----------- | ------------------------ | -------------------------------------------- | ------------------- | ---------------------------------- |
| Development | local                    | local PostgreSQL                             | log / mock          | allowed                            |
| Preview     | any non-main branch / PR | separate preview database                    | mock / sandbox only | allowed (never real customer data) |
| Production  | `main`                   | production PostgreSQL (pooled + direct URLs) | real, once approved | **refused**                        |

Preview deployments must never receive production credentials or customer data; both
Netlify (deploy contexts) and Vercel keep environment variables per environment.

## Hosting

Railway is the default target (`Dockerfile`, `railway.json`, `docs/RAILWAY_SETUP.md`,
ADR-037): one container, PostgreSQL and a volume in the same project, cron jobs scheduled
inside the process (`CRON_MODE=in-process`). Netlify (`docs/NETLIFY_SETUP.md`, ADR-036) and
Vercel (`docs/VERCEL_SETUP.md`) remain supported; the code is host-neutral and the same
`/api/cron/*` routes are called by whichever scheduler the host provides.

| Host        | Scheduler                                       | Storage                             | Rate limits                   | Migrations                          |
| ----------- | ----------------------------------------------- | ----------------------------------- | ----------------------------- | ----------------------------------- |
| Railway     | in-process (`CRON_MODE`)                        | volume (`STORAGE_LOCAL_ROOT`) or S3 | memory (1 replica) or Upstash | pre-deploy command (`railway.json`) |
| Netlify     | scheduled functions or GitHub Actions           | S3-compatible                       | Upstash                       | operator / CI                       |
| Vercel      | GitHub Actions (`cron.yml`); Vercel Cron on Pro | Vercel Blob or S3                   | memory (Hobby) or Upstash     | operator / CI                       |
| Render free | GitHub Actions (`cron.yml`)                     | S3-compatible (R2)                  | memory                        | operator / CI                       |

Free-tier combinations are described step by step in `docs/FREE_HOSTING.md`.

## Build

`pnpm build` = `prisma generate && next build`. `postinstall` also generates the Prisma client
so type checks work right after install. The generated client is git-ignored.

## Database migrations (controlled, never automatic in functions)

Migrations are applied by an operator, a CI step or the host's pre-deploy hook (Railway),
**never** by request-handling code:

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

## Deployment checklist (Netlify; Vercel equivalents in `docs/VERCEL_SETUP.md`)

- [ ] GitHub repository connected (`wouapit999/ridekmer`), production branch `main`
- [ ] Build settings taken from `netlify.toml` (Next.js adapter pinned, Node 22)
- [ ] Environment variables set per deploy context (see `docs/NETLIFY_SETUP.md`)
- [ ] Database reachable (`/api/health`)
- [ ] Migrations applied and status clean
- [ ] Reference data seeded, demo data disabled in production
- [ ] Custom domain + DNS + HTTPS
- [ ] Preview deployment verified (both languages, login, admin)
- [ ] Production deployment verified
- [ ] Rollback procedure tested once (promote previous deployment)
- [ ] Function logs reviewed for errors after deploy
- [ ] Payment webhook URLs registered (when providers are live)
- [ ] The seven `cron-*` scheduled functions listed under Functions with `CRON_SECRET` set; one manual run of `cron-housekeeping` turns the deep health check green
- [ ] `STORAGE_PROVIDER=s3` (S3-compatible bucket) configured; a test upload from the owner wizard succeeds and opens through a signed URL

## Rollback

Code: Netlify → Deploys → pick the previous successful deploy → "Publish deploy" (Vercel:
promote the previous deployment). Database: migrations are forward-only; to
undo, write a new migration that reverses the change, or restore from backup
(`docs/BACKUP_AND_RECOVERY.md`).

## Post-deployment smoke test

`/api/health`, `/fr`, `/en`, login with a real staff account (MFA), `/fr/admin`,
`/fr/cars?city=douala`, contact form submission (creates a `SupportCase`).
