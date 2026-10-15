import "dotenv/config";

// Integration tests run against TEST_DATABASE_URL, never against DATABASE_URL, so that a
// developer cannot accidentally wipe a development or production database.
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) {
  throw new Error("TEST_DATABASE_URL must be set to run integration tests.");
}
if (/prod/i.test(testUrl)) {
  throw new Error(
    "Refusing to run integration tests against a database whose URL mentions 'prod'.",
  );
}
process.env.DATABASE_URL = testUrl;
process.env.DIRECT_DATABASE_URL = testUrl;
Object.assign(process.env, { NODE_ENV: "test" });
process.env.APP_ENV ??= "development";
process.env.BETTER_AUTH_SECRET ??= "integration-test-secret-not-for-production-0123456789";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
process.env.NEXT_PUBLIC_APP_URL ??= "http://localhost:3000";
process.env.APP_ENCRYPTION_KEY ??= "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
process.env.CRON_SECRET ??= "integration-test-cron-secret";
