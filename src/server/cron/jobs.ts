/**
 * Single source of truth for the scheduled jobs (UTC cron expressions).
 *
 * Consumers:
 * - `src/server/cron/scheduler.ts`: in-process scheduler for long-running hosts (Railway, a VM);
 * - `netlify/functions/cron-*.ts`: one Netlify scheduled function per job;
 * - `vercel.json`: Vercel Cron schedules.
 * A unit test keeps the three in sync. The route handlers under `src/app/api/cron/*` hold the
 * business logic and are host-neutral.
 */
export interface CronJob {
  /** Route path, also the job identifier. */
  path: `/api/cron/${string}`;
  /** 5-field cron expression, UTC. */
  schedule: string;
  description: string;
}

export const CRON_JOBS: readonly CronJob[] = [
  {
    path: "/api/cron/expire-holds",
    schedule: "*/5 * * * *",
    description: "Expire checkout holds and unpaid bookings",
  },
  {
    path: "/api/cron/reconcile-payments",
    schedule: "*/15 * * * *",
    description: "Expire stale payment requests, poll open payments, reconcile settled ones",
  },
  {
    path: "/api/cron/operations",
    schedule: "0 * * * *",
    description: "Pickup/return reminders, late returns, maintenance reminders",
  },
  {
    path: "/api/cron/housekeeping",
    schedule: "30 2 * * *",
    description: "Retention purges, notification retries, due account anonymisations",
  },
  {
    path: "/api/cron/statements",
    schedule: "0 3 1 * *",
    description: "Ledger catch-up and monthly owner statements",
  },
  {
    path: "/api/cron/tracking-retention",
    schedule: "0 4 * * *",
    description: "Purge location history beyond the retention period",
  },
  {
    path: "/api/cron/document-expiry",
    schedule: "0 5 * * *",
    description: "Document expiry alerts and automatic vehicle unavailability",
  },
];
