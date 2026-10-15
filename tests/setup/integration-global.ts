import { execSync } from "node:child_process";

import "dotenv/config";

/**
 * Vitest global setup for the integration project: applies committed migrations to the
 * dedicated test database and seeds reference data (roles, permissions, cities, …).
 */
export default async function setup() {
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) throw new Error("TEST_DATABASE_URL must be set to run integration tests.");
  if (/prod/i.test(testUrl))
    throw new Error("Refusing to run integration tests against a 'prod' database.");
  const env = {
    ...process.env,
    DATABASE_URL: testUrl,
    DIRECT_DATABASE_URL: testUrl,
    ALLOW_DEMO_SEED: "false",
  };
  execSync("pnpm exec prisma migrate deploy", { env, stdio: "inherit" });
  execSync("pnpm exec tsx prisma/seed.ts", { env, stdio: "inherit" });
}
