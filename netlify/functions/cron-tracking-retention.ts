import type { Config } from "@netlify/functions";

import { scheduledCron } from "../lib/trigger-cron";

/** Daily 04:00 UTC: purge location history beyond the retention period. Mirrors the `/api/cron/tracking-retention` entry in vercel.json. */
export default scheduledCron("/api/cron/tracking-retention");

export const config: Config = { schedule: "0 4 * * *" };
