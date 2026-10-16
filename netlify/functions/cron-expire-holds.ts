import type { Config } from "@netlify/functions";

import { scheduledCron } from "../lib/trigger-cron";

/** Every 5 minutes: expire checkout holds and unpaid bookings. Mirrors the `/api/cron/expire-holds` entry in vercel.json. */
export default scheduledCron("/api/cron/expire-holds");

export const config: Config = { schedule: "*/5 * * * *" };
