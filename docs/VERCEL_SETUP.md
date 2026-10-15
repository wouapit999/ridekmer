# Vercel setup (step by step)

For Roland or any administrator of the `wouapit999` GitHub account. No secret values appear in
this document; generate them where indicated.

## Prerequisites

- The repository `wouapit999/ridekmer` exists with `main` and `develop` branches
  (`docs/GITHUB_WORKFLOW.md`).
- A managed PostgreSQL project (Neon or Supabase recommended) with **two** connection strings:
  pooled (runtime) and direct (migrations).
- An Upstash Redis database (REST URL + token).
- A Vercel Blob store (or S3-compatible bucket).

## 1. Sign in to Vercel

Go to https://vercel.com and sign in **with the GitHub account that owns `wouapit999`** so the
GitHub integration can see the repository. Create a team or use the personal account.

## 2. Import the repository

Add New → Project → Import `wouapit999/ridekmer`. If it is not listed, click "Adjust GitHub
App Permissions" and grant access to the repository.

## 3. Framework preset

Vercel detects **Next.js**. Keep:

- Root directory: `.` (repository root)
- Build command: `pnpm build` (runs `prisma generate && next build`)
- Install command: `pnpm install --frozen-lockfile`
- Output directory: default (leave empty)
- Node.js version: 22.x (Project Settings → General)

## 4. Production branch

Project Settings → Git → Production Branch: `main`.

## 5. Preview deployments

Every push to any other branch and every PR gets a preview URL automatically. Set environment
variables for the **Preview** environment to point at a **separate** database (never
production) and keep payment providers in `mock`/`sandbox` mode.

## 6–12. Environment variables

Project Settings → Environment Variables. Add each variable to the right environment
(Production / Preview / Development). Reference: `.env.example`.

| Group          | Variables                                                                                                                                              | Production value guidance                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Application    | `APP_ENV=production`, `NEXT_PUBLIC_APP_URL=https://<domain>`, `NEXT_PUBLIC_APP_NAME=RideKmer`, `APP_TIMEZONE=Africa/Douala`, `LOG_LEVEL=info`          | Preview: `APP_ENV=preview`                                              |
| Database       | `DATABASE_URL` (pooled), `DIRECT_DATABASE_URL` (direct)                                                                                                | From the PostgreSQL provider dashboard                                  |
| Authentication | `BETTER_AUTH_SECRET` (`openssl rand -base64 32`), `BETTER_AUTH_URL=https://<domain>`, `AUTH_REQUIRE_STAFF_MFA=true`, `AUTH_TRUSTED_ORIGINS` (optional) | Different secret per environment                                        |
| Encryption     | `APP_ENCRYPTION_KEY` (`openssl rand -base64 32`), `APP_ENCRYPTION_KEY_ID=v1`                                                                           | Back this key up securely — losing it makes encrypted fields unreadable |
| Key rotation   | `APP_ENCRYPTION_KEY_PREVIOUS`, `APP_ENCRYPTION_KEY_PREVIOUS_ID`                                                                                        | Only while `pnpm db:rotate-key` runs; remove afterwards                 |
| Storage        | `STORAGE_PROVIDER=vercel-blob`, `BLOB_READ_WRITE_TOKEN` (Storage → Blob → connect to project)                                                          | or `s3` + `S3_*`                                                        |
| Redis          | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`                                                                                                   | Required in production                                                  |
| Payments       | `MTN_MOMO_*`, `ORANGE_MONEY_*`, `CARD_PAYMENT_*`, `PAYMENT_*`                                                                                          | Keep `*_ENVIRONMENT=mock` until credentials and approval exist          |
| Notifications  | `EMAIL_PROVIDER`, `EMAIL_FROM`, `RESEND_API_KEY` or `SMTP_*`, `SMS_*`, `WHATSAPP_*`, `WEB_PUSH_*`                                                      | `log` providers only in preview                                         |
| GPS            | `GPS_PROVIDER`, `GPS_PROVIDER_*`, `GPS_WEBHOOK_SECRET`, `GPS_LOCATION_RETENTION_DAYS`                                                                  | `mock` until a provider is contracted                                   |
| Monitoring     | `MONITORING_PROVIDER`, `SENTRY_DSN`                                                                                                                    | optional                                                                |
| Cron           | `CRON_SECRET` (`openssl rand -hex 32`)                                                                                                                 | Vercel uses it automatically for cron requests                          |
| Demo           | `ALLOW_DEMO_SEED=false`                                                                                                                                | **Never** true in production (the app refuses to start otherwise)       |

## 13. Deploy a preview

Push a branch (e.g. `develop`). Vercel builds it; open the preview URL.

## 14. Verify the preview

- `GET /api/health` returns `{"status":"ok","database":"ok"}`.
- `/fr` and `/en` render; language switch works; register + login work.
- Run migrations against the preview database first (`docs/DEPLOYMENT.md`), otherwise the
  health check reports the database but pages fail with missing tables.

## 15. Deploy production

Merge `develop` into `main`. Before the first production deployment, apply migrations to the
production database (`pnpm db:migrate:deploy` with `DIRECT_DATABASE_URL` pointing to
production) and seed reference data **without** demo data (`ALLOW_DEMO_SEED=false pnpm db:seed`).

## 16. Custom domain

Project Settings → Domains → add `ridekmer.<tld>` and `www`. Vercel shows the DNS records
(A/ALIAS or CNAME) to create at the registrar; certificates are issued automatically. Update
`NEXT_PUBLIC_APP_URL` and `BETTER_AUTH_URL`, then redeploy.

## 17. Payment webhook URLs

After the production URL exists, register in each provider portal (Milestone 4 routes):
`https://<domain>/api/webhooks/payments/mtn-momo`, `/orange-money`, `/card`, and set the
matching `*_WEBHOOK_SECRET` either as Vercel variables or from **Admin → Settings → Payment
configuration**, where provider environment, base URL and credentials are stored encrypted and
override the variables of the same name.

## 18. Cron-job authentication

`vercel.json` (added with the first job) declares schedules; Vercel calls the routes with
`Authorization: Bearer <CRON_SECRET>`. Keep `CRON_SECRET` set in Production and Preview.

## 19. Function logs

Project → Deployments → select deployment → Functions / Logs, or Observability → Logs.
Logs are JSON lines with secrets and personal data redacted. Filter by `level` and `msg`.

## 20. Rollback

Deployments → pick the last good production deployment → "Promote to Production" (instant
rollback). If a migration was applied with the bad release, follow
`docs/BACKUP_AND_RECOVERY.md` before rolling back the code.
