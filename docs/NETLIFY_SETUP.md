# Netlify setup

RideKmer deploys to Netlify as the primary host (ADR-036). Vercel remains supported
(`vercel.json`, `docs/VERCEL_SETUP.md`), but its Hobby plan only allows daily cron jobs,
which is not enough for hold expiry and payment reconciliation.

## What the repository already contains

| File                          | Purpose                                                                                               |
| ----------------------------- | ----------------------------------------------------------------------------------------------------- |
| `netlify.toml`                | build command, publish directory, Node 22, pinned `@netlify/plugin-nextjs`                            |
| `netlify/functions/cron-*.ts` | seven scheduled functions mirroring `vercel.json`; each calls its `/api/cron/*` route with the secret |
| `netlify/lib/trigger-cron.ts` | shared, unit-tested request helper                                                                    |
| `next.config.ts`              | security headers (CSP, HSTS, …) — honoured by the Netlify Next.js adapter                             |
| `src/proxy.ts`                | locale routing, deployed as a Netlify edge function by the adapter                                    |

Scheduled functions run only on the **production** deploy (published branch), in UTC, and are
available on the free plan. They are capped at about 30 s, so each one waits at most 25 s for
the route and then returns; the route keeps running on its own function.

## Create the site (one-off, account owner)

1. Netlify → Add new site → Import an existing project → GitHub → `wouapit999/ridekmer`.
2. Production branch `main`. Branch deploys: enable for `develop` (preview), disable deploy
   previews for pull requests until a preview database exists (they would build with the
   production variables otherwise).
3. Build settings are read from `netlify.toml`; leave the dashboard values empty.
4. Site configuration → Environment variables: add every variable below. Use **Scopes =
   Builds + Functions** and set **Deploy contexts** so that preview values differ from
   production. Secrets (`BETTER_AUTH_SECRET`, `APP_ENCRYPTION_KEY`, `CRON_SECRET`, database
   URLs, provider keys) must be marked **secret**.
5. Deploy. The first build runs `prisma generate` and `next build`; migrations are **not**
   run by the build (see `docs/DEPLOYMENT.md`).
6. After the first deploy: Site configuration → Functions → Scheduled functions must list the
   seven `cron-*` functions with their schedules. Logs → Functions shows each run.

## Environment variables

Same list as `docs/VERCEL_SETUP.md`, with these Netlify specifics:

| Variable                                      | Netlify value                                                                                    |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_APP_URL`, `BETTER_AUTH_URL`      | `https://<site>.netlify.app` until the custom domain is live, then the domain                    |
| `AUTH_TRUSTED_ORIGINS`                        | the same origin(s)                                                                               |
| `APP_ENV`                                     | `production` on the production context, `preview` on branch deploys                              |
| `NODE_ENV`                                    | leave unset (Netlify sets `production` for builds)                                               |
| `CRON_SECRET`                                 | `openssl rand -hex 32`; the scheduled functions read it from the same environment                |
| `CRON_BASE_URL`                               | optional; defaults to Netlify's `URL` (production site URL)                                      |
| `STORAGE_PROVIDER`                            | `s3` with an S3-compatible bucket (Cloudflare R2, Backblaze B2, Wasabi, AWS S3); `local` refuses |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, keys | from the bucket provider                                                                         |
| `UPSTASH_REDIS_REST_URL`, `_TOKEN`            | required in production (rate limits)                                                             |
| `DATABASE_URL`, `DIRECT_DATABASE_URL`         | pooled and direct URLs of the managed PostgreSQL (Neon, Supabase, …)                             |
| `MONITORING_PROVIDER`                         | `none` until an SDK is installed                                                                 |

`VERCEL_GIT_COMMIT_SHA` is not available; the health endpoint and boot log fall back to
Netlify's `COMMIT_REF`.

## Limits to know (free plan)

- Synchronous functions, including Next.js route handlers and server actions, have a short
  execution limit (10 s by default; Netlify support can raise it to 26 s per site). Cron
  routes are batched and idempotent, so a run that is cut short is simply resumed by the next
  run. `export const maxDuration` in the routes is a Vercel setting and is ignored here.
- Request body limit is 6 MB for functions: keep `STORAGE_MAX_FILE_SIZE_BYTES` at or below
  5 MB until direct-to-storage uploads exist (OPEN_ITEMS 45).
- Scheduled functions do not run on branch deploys or deploy previews.
- Bandwidth and build minutes are metered; the public pages are static so traffic is cheap.

## Verifying a deploy

```bash
curl -s https://<site>.netlify.app/api/health
curl -s -H "Authorization: Bearer $CRON_SECRET" https://<site>.netlify.app/api/health   # deep checks
curl -s -H "Authorization: Bearer $CRON_SECRET" https://<site>.netlify.app/api/cron/expire-holds
```

The deep health check reports `cron` as `degraded` until the housekeeping function has run
once (daily at 02:30 UTC); trigger it manually from Netlify → Functions if you want it green
immediately.

## Custom domain

Domain management → Add domain → follow the DNS instructions (Netlify DNS or CNAME /
ALIAS). HTTPS certificates are automatic. Then update `NEXT_PUBLIC_APP_URL`,
`BETTER_AUTH_URL` and `AUTH_TRUSTED_ORIGINS` and redeploy.
