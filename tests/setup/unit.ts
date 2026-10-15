// Unit tests run without a database. Provide the minimum environment so modules that read
// `env` at import time do not throw.
Object.assign(process.env, { NODE_ENV: process.env.NODE_ENV ?? "test" });
process.env.APP_ENV ??= "development";
process.env.NEXT_PUBLIC_APP_URL ??= "http://localhost:3000";
process.env.BETTER_AUTH_SECRET ??= "unit-test-secret-not-for-production-0123456789";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
process.env.APP_ENCRYPTION_KEY ??= "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/ridekmer_test";
process.env.CRON_SECRET ??= "unit-test-cron-secret";
