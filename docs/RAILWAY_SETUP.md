# Railway setup

Railway runs RideKmer as one long-lived container (ADR-037): no serverless time limits, no
framework adapter, PostgreSQL in the same project, a persistent volume for uploads, and the
cron jobs scheduled inside the application. Netlify and Vercel remain supported
(`docs/NETLIFY_SETUP.md`, `docs/VERCEL_SETUP.md`).

## What the repository already contains

| File                           | Purpose                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `Dockerfile`                   | multi-stage image: pnpm install, `next build`, production dependencies only, non-root user, healthcheck |
| `.dockerignore`                | keeps tests, docs, local storage and `.env` files out of the image                                      |
| `railway.json`                 | Dockerfile builder, pre-deploy command (migrations + reference seed), health check, one replica         |
| `src/server/cron/jobs.ts`      | the seven jobs and their UTC schedules (shared with Netlify and Vercel)                                 |
| `src/server/cron/scheduler.ts` | in-process scheduler started when `CRON_MODE=in-process`                                                |

Each deploy runs, in order: image build → `prisma migrate deploy` and the idempotent
reference seed (pre-deploy command, on the new image, before traffic switches) → health check
on `/api/health` → traffic switch.

## Create the project (one-off, account owner)

1. https://railway.com → New Project → **Deploy from GitHub repo** → `wouapit999/ridekmer`.
   Railway detects the `Dockerfile` and `railway.json`.
2. In the same project click **+ New** → **Database** → **PostgreSQL**. Railway creates a
   `Postgres` service and exposes its connection variables.
3. Open the app service → **Variables** → **Raw Editor** and paste the block below, replacing
   the placeholders. Reference the database with Railway's variable references so the URL is
   never copied by hand:

   ```
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   DIRECT_DATABASE_URL=${{Postgres.DATABASE_URL}}
   APP_ENV=production
   NEXT_PUBLIC_APP_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}
   BETTER_AUTH_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}
   AUTH_TRUSTED_ORIGINS=https://${{RAILWAY_PUBLIC_DOMAIN}}
   BETTER_AUTH_SECRET=<openssl rand -base64 48>
   APP_ENCRYPTION_KEY=<openssl rand -base64 32>
   APP_ENCRYPTION_KEY_ID=v1
   CRON_SECRET=<openssl rand -hex 32>
   CRON_MODE=in-process
   RATE_LIMIT_BACKEND=memory
   STORAGE_PROVIDER=local
   STORAGE_LOCAL_ROOT=/data
   ALLOW_DEMO_SEED=false
   LOG_LEVEL=info
   ```

   `RAILWAY_PUBLIC_DOMAIN` only exists once step 5 is done; redeploy after that step.

4. **Settings** → **Volumes** → Add volume, mount path `/data`. This is where identity
   documents, vehicle photos and inspection photos are stored (`STORAGE_LOCAL_ROOT`).
   Volumes are persistent across deploys; include them in your backup plan
   (`docs/BACKUP_AND_RECOVERY.md`).
5. **Settings** → **Networking** → **Generate Domain** (port 3000). Later add the custom
   domain here and update the three URL variables.
6. **Settings** → **Deploy**: confirm the pre-deploy command, health check path and
   **replicas = 1** came from `railway.json`. The in-process scheduler and the memory rate
   limiter assume a single replica; before scaling out, switch to Upstash
   (`RATE_LIMIT_BACKEND=upstash`) and keep `CRON_MODE=in-process` on one service only.
7. Deploy. The first build takes 4–6 minutes. Then:

   ```bash
   curl -s https://<domain>/api/health
   curl -s -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/health   # deep checks
   ```

   The deep check reports `cron` as `in-process (7 jobs)`.

## Demo data (optional, never in production)

To look at the demo accounts on a throwaway environment, create a second Railway
environment, set `APP_ENV=preview` and `ALLOW_DEMO_SEED=true` there, and run
`pnpm db:seed` once from the service shell. Production refuses demo data.

## Limits and costs

- Hobby plan: about 5 USD per month of usage credit after the trial; this app at idle uses
  well under 1 GB of memory. Set a usage limit under Account → Usage.
- One container: no 10-second function limits, uploads up to `STORAGE_MAX_FILE_SIZE_BYTES`
  (12 MB server action limit), long cron jobs are fine.
- Railway sleeps nothing by default; the scheduler keeps running.
- Build-time variables: `NEXT_PUBLIC_*` values are inlined into the client bundle at build
  time; Railway passes service variables to the Dockerfile build, and the `Dockerfile`
  declares the three public ones as build arguments.

## Switching hosts later

Everything host-specific is configuration: `CRON_MODE`, `RATE_LIMIT_BACKEND`,
`STORAGE_PROVIDER`/`STORAGE_LOCAL_ROOT`. Moving to S3-compatible storage and Upstash makes
the same image horizontally scalable; moving to Netlify or Vercel means `CRON_MODE=external`
and their own schedules.
