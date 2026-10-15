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
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
    });
  } catch (error) {
    logger.fatal("app.boot.invalid_environment", { error });
    throw error;
  }
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
