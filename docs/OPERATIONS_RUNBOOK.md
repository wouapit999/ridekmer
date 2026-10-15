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

1. Register a normal account through `/fr/register` with the administrator's email.
2. Grant the role with the direct database URL (one-off):

   ```sql
   INSERT INTO "UserRole" ("userId", "roleId", "assignedBy")
   SELECT u.id, r.id, 'bootstrap' FROM "User" u, "Role" r
   WHERE u.email = 'admin@example.com' AND r.key = 'super_administrator'
   ON CONFLICT DO NOTHING;
   ```

3. Sign in, go to _Account → Security_, enable TOTP (mandatory for staff), store backup codes.
4. From _Administration → Users_ grant further roles; never share the super administrator.

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
