import { Cron } from "croner";

import { logger } from "@/lib/logger";

import { CRON_JOBS, type CronJob } from "./jobs";

/**
 * In-process scheduler for hosts that run RideKmer as one long-lived Node process
 * (Railway, Render, a VM) — ADR-037. Each job is triggered by an HTTP request to the
 * application's own cron route with the cron secret, exactly like Vercel Cron or the Netlify
 * scheduled functions would do, so the business logic and its authentication stay identical
 * across hosts.
 *
 * Run it on exactly one replica (`CRON_MODE=in-process`); `protect: true` prevents a job from
 * overlapping with its own previous run.
 */
export interface SchedulerOptions {
  baseUrl: string;
  secret: string;
  jobs?: readonly CronJob[];
  fetchImpl?: typeof fetch;
  /** Maximum time one job run may take before the request is abandoned. */
  timeoutMs?: number;
}

export interface SchedulerHandle {
  jobs: Array<{ path: string; schedule: string; nextRun: Date | null }>;
  stop(): void;
}

/** Pure: validates the plan without starting anything (used by tests and the health check). */
export function schedulerPlan(jobs: readonly CronJob[] = CRON_JOBS) {
  return jobs.map((job) => {
    const probe = new Cron(job.schedule, { timezone: "UTC", paused: true });
    const nextRun = probe.nextRun();
    probe.stop();
    return { path: job.path, schedule: job.schedule, nextRun };
  });
}

export async function runJob(
  job: CronJob,
  options: Required<Pick<SchedulerOptions, "baseUrl" | "secret" | "fetchImpl" | "timeoutMs">>,
) {
  const startedAt = Date.now();
  try {
    const response = await options.fetchImpl(`${options.baseUrl}${job.path}`, {
      method: "GET",
      headers: { authorization: `Bearer ${options.secret}`, "user-agent": "ridekmer-scheduler" },
      signal: AbortSignal.timeout(options.timeoutMs),
    });
    const text = await response.text();
    logger[response.ok ? "info" : "error"]("cron.run", {
      path: job.path,
      status: response.status,
      durationMs: Date.now() - startedAt,
      body: text.slice(0, 500),
    });
    return response.ok;
  } catch (error) {
    logger.error("cron.run_failed", { path: job.path, durationMs: Date.now() - startedAt, error });
    return false;
  }
}

let active: SchedulerHandle | null = null;

export function startInProcessScheduler(options: SchedulerOptions): SchedulerHandle {
  if (active) return active;
  const jobs = options.jobs ?? CRON_JOBS;
  const run = {
    baseUrl: options.baseUrl.replace(/\/+$/, ""),
    secret: options.secret,
    fetchImpl: options.fetchImpl ?? fetch,
    timeoutMs: options.timeoutMs ?? 10 * 60_000,
  };
  const tasks = jobs.map(
    (job) =>
      new Cron(job.schedule, { timezone: "UTC", protect: true, name: job.path }, async () => {
        await runJob(job, run);
      }),
  );
  active = {
    jobs: tasks.map((task, i) => ({
      path: jobs[i]!.path,
      schedule: jobs[i]!.schedule,
      nextRun: task.nextRun(),
    })),
    stop() {
      for (const task of tasks) task.stop();
      active = null;
    },
  };
  logger.info("cron.scheduler_started", {
    mode: "in-process",
    jobs: active.jobs.map((j) => `${j.path} ${j.schedule}`),
  });
  return active;
}

export function activeScheduler(): SchedulerHandle | null {
  return active;
}
