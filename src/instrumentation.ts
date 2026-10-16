import type { Instrumentation } from "next";

/**
 * Next.js instrumentation hook. Runs once per server instance:
 * - validates the environment at boot so a misconfigured deployment fails fast and loudly;
 * - routes every uncaught request error through the redacting logger (and, when configured,
 *   an external monitoring provider).
 *
 * No third-party SDK is bundled: MONITORING_PROVIDER=sentry only changes the log line until
 * the account owner installs and configures the SDK (docs/OPERATIONS_RUNBOOK.md).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { getEnv } = await import("@/lib/env");
  const { logger } = await import("@/lib/logger");
  try {
    const env = getEnv();
    logger.info("app.boot", {
      appEnv: env.APP_ENV,
      storageProvider: env.STORAGE_PROVIDER,
      gpsProvider: env.GPS_PROVIDER,
      monitoring: env.MONITORING_PROVIDER,
      cronMode: env.CRON_MODE,
      commit: commitSha(),
    });
    if (env.CRON_MODE === "in-process") {
      // Long-running hosts (Railway, a VM): schedule the cron routes from inside the process.
      const { startInProcessScheduler } = await import("@/server/cron/scheduler");
      startInProcessScheduler({
        baseUrl: env.CRON_BASE_URL ?? `http://127.0.0.1:${process.env.PORT ?? "3000"}`,
        secret: env.CRON_SECRET,
      });
    }
  } catch (error) {
    logger.fatal("app.boot.invalid_environment", { error });
    throw error;
  }
}

/** Git commit of the running build, whichever host provides it. */
export function commitSha(): string {
  return (
    (
      process.env.VERCEL_GIT_COMMIT_SHA ??
      process.env.COMMIT_REF ??
      process.env.RAILWAY_GIT_COMMIT_SHA ??
      process.env.SOURCE_COMMIT
    )?.slice(0, 7) ?? "local"
  );
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { logger } = await import("@/lib/logger");
  logger.error("request.unhandled_error", {
    error,
    method: request.method,
    path: request.path,
    routerKind: context.routerKind,
    routePath: context.routePath,
    routeType: context.routeType,
    renderSource: context.renderSource,
    monitoring: process.env.MONITORING_PROVIDER ?? "none",
  });
};
