import type { Config } from "@netlify/functions";

import { scheduledCron } from "../lib/trigger-cron";

/** Monthly, 1st 03:00 UTC: ledger catch-up and owner statements. Mirrors the `/api/cron/statements` entry in vercel.json. */
export default scheduledCron("/api/cron/statements");

export const config: Config = { schedule: "0 3 1 * *" };
