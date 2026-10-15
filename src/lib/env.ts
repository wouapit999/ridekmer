import { z } from "zod";

/**
 * Server-side environment validation. Import only from server code.
 * Secrets are never exposed through NEXT_PUBLIC_ variables.
 */
const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v === "" ? undefined : v));

const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ENV: z.enum(["development", "preview", "production"]).default("development"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_APP_NAME: z.string().default("RideKmer"),
  APP_TIMEZONE: z.string().default("Africa/Douala"),
  APP_CURRENCY: z.string().default("XAF"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug"]).default("info"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DIRECT_DATABASE_URL: optionalString,

  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  BETTER_AUTH_URL: z.string().url().default("http://localhost:3000"),
  AUTH_TRUSTED_ORIGINS: optionalString,
  AUTH_REQUIRE_STAFF_MFA: z
    .string()
    .default("true")
    .transform((v) => v === "true"),
  /** Multiplies per-IP auth rate limits; > 1 is only honoured outside production (e2e runs). */
  AUTH_RATE_LIMIT_MULTIPLIER: z.coerce.number().int().min(1).max(100).default(1),

  APP_ENCRYPTION_KEY: z.string().min(32, "APP_ENCRYPTION_KEY must be a 32-byte base64 key"),
  APP_ENCRYPTION_KEY_ID: z.string().default("v1"),
  /** Previous key kept readable during a rotation (see scripts/rotate-encryption-key.ts). */
  APP_ENCRYPTION_KEY_PREVIOUS: optionalString,
  APP_ENCRYPTION_KEY_PREVIOUS_ID: optionalString,

  UPSTASH_REDIS_REST_URL: optionalString,
  UPSTASH_REDIS_REST_TOKEN: optionalString,

  STORAGE_PROVIDER: z.enum(["local", "vercel-blob", "s3"]).default("local"),
  BLOB_READ_WRITE_TOKEN: optionalString,
  S3_ENDPOINT: optionalString,
  S3_REGION: optionalString,
  S3_BUCKET: optionalString,
  S3_ACCESS_KEY_ID: optionalString,
  S3_SECRET_ACCESS_KEY: optionalString,
  STORAGE_SIGNED_URL_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  STORAGE_MAX_FILE_SIZE_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(10 * 1024 * 1024),
  MALWARE_SCAN_PROVIDER: z.enum(["none", "clamav-http", "custom"]).default("none"),

  EMAIL_PROVIDER: z.enum(["log", "resend", "smtp"]).default("log"),
  EMAIL_FROM: z.string().default("RideKmer <no-reply@example.com>"),
  RESEND_API_KEY: optionalString,
  SMTP_HOST: optionalString,
  SMTP_PORT: z.coerce.number().int().optional(),
  SMTP_USER: optionalString,
  SMTP_PASSWORD: optionalString,

  SMS_PROVIDER: z.enum(["log", "generic-http"]).default("log"),
  SMS_SENDER_ID: z.string().default("RideKmer"),
  SMS_API_URL: optionalString,
  SMS_API_KEY: optionalString,

  WHATSAPP_PROVIDER: z.enum(["log", "meta-cloud"]).default("log"),
  WHATSAPP_PHONE_NUMBER_ID: optionalString,
  WHATSAPP_ACCESS_TOKEN: optionalString,
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: optionalString,

  WEB_PUSH_PRIVATE_KEY: optionalString,
  WEB_PUSH_SUBJECT: optionalString,

  MTN_MOMO_ENVIRONMENT: z.enum(["mock", "sandbox", "production"]).default("mock"),
  MTN_MOMO_BASE_URL: optionalString,
  MTN_MOMO_SUBSCRIPTION_KEY: optionalString,
  MTN_MOMO_API_USER: optionalString,
  MTN_MOMO_API_KEY: optionalString,
  MTN_MOMO_WEBHOOK_SECRET: optionalString,

  ORANGE_MONEY_ENVIRONMENT: z.enum(["mock", "sandbox", "production"]).default("mock"),
  ORANGE_MONEY_BASE_URL: optionalString,
  ORANGE_MONEY_CLIENT_ID: optionalString,
  ORANGE_MONEY_CLIENT_SECRET: optionalString,
  ORANGE_MONEY_MERCHANT_KEY: optionalString,
  ORANGE_MONEY_WEBHOOK_SECRET: optionalString,

  CARD_PAYMENT_PROVIDER: z.string().default("mock"),
  CARD_PAYMENT_PUBLIC_KEY: optionalString,
  CARD_PAYMENT_SECRET_KEY: optionalString,
  CARD_PAYMENT_WEBHOOK_SECRET: optionalString,

  PAYMENT_WEBHOOK_REPLAY_WINDOW_SECONDS: z.coerce.number().int().positive().default(300),
  PAYMENT_DUAL_APPROVAL_THRESHOLD_XAF: z.coerce.number().int().nonnegative().default(200_000),

  GPS_PROVIDER: z.enum(["mock", "generic-rest"]).default("mock"),
  GPS_PROVIDER_BASE_URL: optionalString,
  GPS_PROVIDER_API_KEY: optionalString,
  GPS_WEBHOOK_SECRET: optionalString,
  GPS_LOCATION_RETENTION_DAYS: z.coerce.number().int().positive().default(90),
  /** Raster tile template for the admin fleet map ({z}/{x}/{y}); no key, served over https. */
  MAP_TILE_URL_TEMPLATE: z.string().url().default("https://tile.openstreetmap.org/{z}/{x}/{y}.png"),

  MONITORING_PROVIDER: z.enum(["none", "sentry"]).default("none"),
  SENTRY_DSN: optionalString,

  CRON_SECRET: z.string().min(16, "CRON_SECRET must be at least 16 characters"),

  ALLOW_DEMO_SEED: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | undefined;

/**
 * Parse and cache the server environment. Throws a readable error listing every missing or
 * invalid variable so misconfiguration is caught at startup rather than deep in a request.
 */
export function getEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const env = parsed.data;
  if (env.NODE_ENV === "production" && env.APP_ENV === "production") {
    assertProductionSafety(env);
  }
  cached = env;
  return env;
}

function assertProductionSafety(env: ServerEnv) {
  const problems: string[] = [];
  if (env.STORAGE_PROVIDER === "local") {
    problems.push(
      "STORAGE_PROVIDER=local is not allowed in production (no persistent disk on Vercel).",
    );
  }
  if (env.ALLOW_DEMO_SEED) {
    problems.push("ALLOW_DEMO_SEED must not be true in production.");
  }
  if (/localhost|127\.0\.0\.1/.test(env.DATABASE_URL)) {
    problems.push("DATABASE_URL points at localhost in production.");
  }
  if (env.AUTH_RATE_LIMIT_MULTIPLIER !== 1) {
    problems.push("AUTH_RATE_LIMIT_MULTIPLIER must be 1 in production.");
  }
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
    problems.push("Upstash Redis is required in production for distributed rate limiting.");
  }
  if (problems.length > 0) {
    throw new Error(
      `Unsafe production configuration:\n${problems.map((p) => `  - ${p}`).join("\n")}`,
    );
  }
}

/** Reset the cache (tests only). */
export function resetEnvCache() {
  cached = undefined;
}

/** Values safe to use in client components. */
export const publicEnv = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? "RideKmer",
  defaultLocale: process.env.NEXT_PUBLIC_DEFAULT_LOCALE ?? "fr",
} as const;
