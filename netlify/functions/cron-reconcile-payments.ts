import type { Config } from "@netlify/functions";

import { scheduledCron } from "../lib/trigger-cron";

/** Every 15 minutes: expire stale payment requests, poll open payments, reconcile. Mirrors the `/api/cron/reconcile-payments` entry in vercel.json. */
export default scheduledCron("/api/cron/reconcile-payments");

export const config: Config = { schedule: "*/15 * * * *" };
