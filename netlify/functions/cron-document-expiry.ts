import type { Config } from "@netlify/functions";

import { scheduledCron } from "../lib/trigger-cron";

/** Daily 05:00 UTC: document expiry alerts and automatic vehicle unavailability. Mirrors the `/api/cron/document-expiry` entry in vercel.json. */
export default scheduledCron("/api/cron/document-expiry");

export const config: Config = { schedule: "0 5 * * *" };
