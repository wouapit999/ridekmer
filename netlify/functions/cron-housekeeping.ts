import type { Config } from "@netlify/functions";

import { scheduledCron } from "../lib/trigger-cron";

/** Daily 02:30 UTC: retention purges, notification retries, due anonymisations. Mirrors the `/api/cron/housekeeping` entry in vercel.json. */
export default scheduledCron("/api/cron/housekeeping");

export const config: Config = { schedule: "30 2 * * *" };
