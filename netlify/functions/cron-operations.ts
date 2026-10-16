import type { Config } from "@netlify/functions";

import { scheduledCron } from "../lib/trigger-cron";

/** Hourly: pickup/return reminders, late returns, maintenance reminders. Mirrors the `/api/cron/operations` entry in vercel.json. */
export default scheduledCron("/api/cron/operations");

export const config: Config = { schedule: "0 * * * *" };
