/**
 * Shared body of the Netlify scheduled functions (docs/BACKGROUND_JOBS.md, ADR-036).
 *
 * Netlify's scheduler cannot invoke a Next.js route handler in-process, so each scheduled
 * function makes one authenticated HTTPS request to the same cron route that Vercel Cron
 * would call. The business logic stays in `src/app/api/cron/*`; this file only knows how to
 * reach it.
 */
export interface CronEnv {
  CRON_SECRET?: string;
  /** Explicit base URL; otherwise Netlify's `URL` (production site URL) is used. */
  CRON_BASE_URL?: string;
  URL?: string;
}

export interface TriggerResult {
  ok: boolean;
  status: number;
  path: string;
  body?: unknown;
  error?: string;
}

export function cronRequest(
  path: string,
  env: CronEnv,
): { url: string; headers: Record<string, string> } {
  const base = (env.CRON_BASE_URL ?? env.URL ?? "").replace(/\/+$/, "");
  if (!base) throw new Error("CRON_BASE_URL or URL must be set to reach the cron routes");
  if (!env.CRON_SECRET) throw new Error("CRON_SECRET is not configured");
  if (!path.startsWith("/api/cron/")) throw new Error(`Refusing to trigger non-cron path ${path}`);
  return {
    url: `${base}${path}`,
    headers: { authorization: `Bearer ${env.CRON_SECRET}`, "user-agent": "ridekmer-netlify-cron" },
  };
}

/**
 * Waits up to `timeoutMs` (scheduled functions are capped at 30 s). A timeout does not abort
 * the job: the route keeps running on its own function until it finishes or hits its limit.
 */
export async function triggerCron(
  path: string,
  env: CronEnv = process.env as CronEnv,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 25_000,
): Promise<TriggerResult> {
  const { url, headers } = cronRequest(path, env);
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await response.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      /* non-JSON body */
    }
    const result = { ok: response.ok, status: response.status, path, body };
    console.info(
      JSON.stringify({ level: response.ok ? "info" : "error", msg: "cron.trigger", ...result }),
    );
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      JSON.stringify({ level: "error", msg: "cron.trigger_failed", path, error: message }),
    );
    return { ok: false, status: 0, path, error: message };
  }
}

/** Builds the Netlify handler for one cron route. */
export function scheduledCron(path: string) {
  return async () => {
    const result = await triggerCron(path);
    return new Response(JSON.stringify(result), {
      status: result.ok ? 200 : 502,
      headers: { "content-type": "application/json" },
    });
  };
}
