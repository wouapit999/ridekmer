# Background jobs

## Decision (ADR-007)

Vercel serverless functions cannot host an always-on worker, so RideKmer does **not** run
BullMQ inside the deployment. Scheduled work uses **Vercel Cron Jobs** calling authenticated
route handlers; event-driven work uses **provider webhooks**; long or bursty work can later
move to an **external worker** (Railway / Fly / a small VM running the same codebase) or a
Vercel-compatible workflow/queue service without changing business code.

## Mechanics

- Route handlers live under `src/app/api/cron/<job>/route.ts` (from Milestone 2).
- Vercel sends `Authorization: Bearer $CRON_SECRET`; handlers reject anything else.
- Each job is idempotent and bounded (processes a batch, records progress in the database) so a
  rerun or timeout is harmless. Function max duration stays within the plan limit.
- `vercel.json` declares the schedules (first job: document expiry, daily 05:00 UTC = 06:00 Douala).

## Planned schedule

| Job                                                                              | Schedule                  | Milestone |
| -------------------------------------------------------------------------------- | ------------------------- | --------- |
| Expire reservation holds / unpaid bookings                                       | every 5 min               | 3         |
| Document expiry alerts (60/30/14/7/0 days) and automatic vehicle unavailability  | daily 06:00 Africa/Douala | 2         |
| Payment reconciliation (`/api/cron/reconcile-payments`, built)                   | every 15 min              | 4         |
| Pickup / return reminders, late-return detection (`/api/cron/operations`, built) | hourly                    | 5         |
| Maintenance reminders (date / mileage) (same `/api/cron/operations` job)         | hourly                    | 5         |
| Owner statement generation + ledger catch-up (`/api/cron/statements`, built)     | monthly, 1st 03:00 UTC    | 6         |
| Location-data retention purge (`/api/cron/tracking-retention`, built)            | daily 04:00 UTC           | 7         |
| Housekeeping: retention purges, notification retry, due account anonymisations   | daily 02:30 UTC           | 8         |
| (`/api/cron/housekeeping`, built)                                                |                           |           |

## Local development

Call the route with the secret, e.g. `curl -H "Authorization: Bearer $CRON_SECRET"
http://localhost:3000/api/cron/expire-holds`.

## Future external worker

If throughput requires it, deploy the same repository as a Node process (`pnpm worker`) with a
Redis queue (Upstash) and point cron jobs at enqueueing only. This is documented, not built.
