import { afterEach, describe, expect, it, vi } from "vitest";

import { CRON_JOBS } from "@/server/cron/jobs";
import {
  activeScheduler,
  runJob,
  schedulerPlan,
  startInProcessScheduler,
} from "@/server/cron/scheduler";

describe("in-process cron scheduler", () => {
  afterEach(() => activeScheduler()?.stop());

  it("every job has a valid UTC cron expression with a next run", () => {
    const plan = schedulerPlan();
    expect(plan).toHaveLength(CRON_JOBS.length);
    for (const entry of plan) {
      expect(entry.nextRun, entry.path).toBeInstanceOf(Date);
      expect(entry.path.startsWith("/api/cron/")).toBe(true);
    }
    // Hold expiry is the most frequent job: next run is at most five minutes away.
    const holds = plan.find((p) => p.path === "/api/cron/expire-holds")!;
    expect(holds.nextRun!.getTime() - Date.now()).toBeLessThanOrEqual(5 * 60_000);
  });

  it("calls the route with the secret and reports the outcome", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    const ok = await runJob(CRON_JOBS[0]!, {
      baseUrl: "http://127.0.0.1:3000",
      secret: "s3cret",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      timeoutMs: 1000,
    });
    expect(ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://127.0.0.1:3000/api/cron/expire-holds",
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: "Bearer s3cret" }),
      }),
    );
    const failing = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    const failed = await runJob(CRON_JOBS[0]!, {
      baseUrl: "http://127.0.0.1:3000",
      secret: "s3cret",
      fetchImpl: failing as unknown as typeof fetch,
      timeoutMs: 1000,
    });
    expect(failed).toBe(false);
  });

  it("starts once, exposes the schedule and stops cleanly", () => {
    const fetchImpl = vi.fn(async () => new Response("{}"));
    const first = startInProcessScheduler({
      baseUrl: "http://127.0.0.1:3000/",
      secret: "s",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const second = startInProcessScheduler({ baseUrl: "http://x", secret: "y" });
    expect(second).toBe(first);
    expect(first.jobs.map((j) => j.path)).toEqual(CRON_JOBS.map((j) => j.path));
    expect(activeScheduler()).toBe(first);
    first.stop();
    expect(activeScheduler()).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
