# Operations runbook

## Daily checks

- Vercel → Observability: error rate, function duration, 5xx.
- `/api/health` responds `ok`; with `Authorization: Bearer $CRON_SECRET` it also reports
  migrations, storage, payment provider modes and cron freshness (`degraded` means a
  production warning such as a log-only e-mail provider or a housekeeping run older than a
  day).
- Admin dashboard tiles: vehicles awaiting approval, expiring documents, payments to
  reconcile, pending refunds/payouts, open incidents.

## Create the first super administrator (production)

Demo accounts are never created in production. The bootstrap is a one-shot operation that
applies the reference data (roles, permissions, settings, templates), creates the account
with a temporary password and e-mails it, and refuses as soon as a super administrator
exists. Further administrators are granted from _Administration → Users_ (audited).

Prerequisite for the e-mail: `EMAIL_PROVIDER=resend` (+ `RESEND_API_KEY`, verified sender
domain) or `EMAIL_PROVIDER=smtp` (+ `SMTP_HOST/PORT/USER/PASSWORD`), and `EMAIL_FROM`.
Without one, the temporary password is returned to the caller once instead (see below).

Pick one of the three ways:

1. **GitHub Actions** (no tools on your computer): _Actions → Database → Run workflow_, tick
   migrate and seed, fill _bootstrap_admin_email_. The run calls `POST /api/admin/bootstrap`
   on the host with `CRON_TARGET_URL` and `CRON_SECRET` and prints only the outcome.
2. **HTTP** from any terminal that has the cron secret:

   ```bash
   curl -X POST -H "Authorization: Bearer $CRON_SECRET" -H "Content-Type: application/json" \
     -d '{"email":"support@example.com","name":"Support","locale":"fr"}' \
     https://<host>/api/admin/bootstrap
   ```

   `201` created (password e-mailed), `200` role granted to an existing account, `409` an
   administrator already exists, `500` with a `detail` field naming the host-side error. The
   reference data is applied only when the roles are missing; pass `"reseed": true` (or
   `--reseed` on the script) to force it. When the host has no e-mail provider the `201` body carries
   `temporaryPassword` once; treat that response as a secret.

3. **Locally** with the production variables in the shell: `pnpm admin:bootstrap --email
support@example.com` prints the password once when no e-mail provider is configured.

Then sign in, change the temporary password (_Account → Security_), enable TOTP (mandatory
for staff), store the backup codes, and delete the e-mail.

## Suspend a user / vehicle

Administration → Users → Manage → suspend with a reason. Sessions are revoked immediately and
the action is audited. Vehicle suspension arrives with Milestone 2.

## Rotate secrets

- `BETTER_AUTH_SECRET`: set the new value, redeploy; all users are signed out.
- `APP_ENCRYPTION_KEY`: (1) generate a new key (`openssl rand -base64 32`); (2) set
  `APP_ENCRYPTION_KEY=<new>`, `APP_ENCRYPTION_KEY_ID=v2`, `APP_ENCRYPTION_KEY_PREVIOUS=<old>`,
  `APP_ENCRYPTION_KEY_PREVIOUS_ID=v1`, redeploy; (3) run `pnpm db:rotate-key` with the
  production `DIRECT_DATABASE_URL` until it prints "Rotation complete."; (4) remove the
  `*_PREVIOUS*` variables and redeploy. The script is idempotent and batched.
- Provider credentials: update in the provider portal and Vercel, redeploy.

## Incident response (security)

1. Contain: revoke sessions (`DELETE FROM "Session"` for affected users), rotate secrets.
2. Assess from `AuditLog`, `TrackingAccessLog` and Vercel logs.
3. Notify the owner and, where required, affected users and the authority (legal review).
4. Post-mortem recorded in `docs/DECISIONS.md` or an incident file.

## Common problems

| Symptom                                          | Likely cause                                                                                    | Fix                                  |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------- | ------------------------------------ |
| Build fails: "Invalid environment configuration" | missing variable                                                                                | add it in Vercel, redeploy           |
| App starts, pages 500 with Prisma table errors   | migrations not applied                                                                          | `pnpm db:migrate:deploy`             |
| "Unsafe production configuration" at startup     | `STORAGE_PROVIDER=local`, `ALLOW_DEMO_SEED=true`, localhost DB or missing Upstash in production | fix variables                        |
| OTP never arrives                                | `SMS_PROVIDER=log`                                                                              | configure a real SMS provider        |
| Staff cannot open /admin                         | MFA not enabled                                                                                 | enable TOTP under Account → Security |
| Too many requests on login                       | rate limit                                                                                      | wait 60 s; check for abuse in logs   |

## Scheduled jobs

See `docs/BACKGROUND_JOBS.md`; failures appear in Vercel → Cron Jobs → logs. The daily
housekeeping job writes an audit row (`cron.housekeeping`) that the deep health check uses
to detect a stalled scheduler.

## Data-subject requests

- Export: served instantly to the signed-in person (Account → Privacy); nothing to do.
- Deletion: the account is frozen (`PENDING_DELETION`) and anonymised automatically after
  the grace period. Administration → Data requests lists them; "Anonymise now" processes one
  early (refused while bookings, balances or vehicles are outstanding), "Reject" restores the
  account with a reason. Both actions are audited. Staff accounts: remove roles first, then
  the person can request deletion like any customer.
