import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { cronRequest, triggerCron } from "../../netlify/lib/trigger-cron";
import { CRON_JOBS } from "@/server/cron/jobs";

const root = path.resolve(__dirname, "../..");

describe("Netlify scheduled functions", () => {
  it("mirror every job in CRON_JOBS and vercel.json with the same schedule", () => {
    const vercel = JSON.parse(readFileSync(path.join(root, "vercel.json"), "utf8")) as {
      crons: Array<{ path: string; schedule: string }>;
    };
    expect(vercel.crons.length).toBe(CRON_JOBS.length);
    for (const job of CRON_JOBS) {
      expect(vercel.crons.find((c) => c.path === job.path)?.schedule, job.path).toBe(job.schedule);
    }
    const dir = path.join(root, "netlify/functions");
    const netlify = new Map<string, string>();
    for (const file of readdirSync(dir).filter((f) => f.startsWith("cron-"))) {
      const source = readFileSync(path.join(dir, file), "utf8");
      const route = /scheduledCron\("([^"]+)"\)/.exec(source)?.[1];
      const schedule = /schedule: "([^"]+)"/.exec(source)?.[1];
      expect(route, file).toBeDefined();
      expect(schedule, file).toBeDefined();
      netlify.set(route!, schedule!);
    }
    expect(netlify.size).toBe(vercel.crons.length);
    for (const cron of vercel.crons) {
      expect(netlify.get(cron.path), cron.path).toBe(cron.schedule);
    }
  });

  it("builds an authenticated request against the production URL", () => {
    const { url, headers } = cronRequest("/api/cron/expire-holds", {
      URL: "https://ridekmer.netlify.app/",
      CRON_SECRET: "s3cret",
    });
    expect(url).toBe("https://ridekmer.netlify.app/api/cron/expire-holds");
    expect(headers.authorization).toBe("Bearer s3cret");
  });

  it("refuses to run without a secret, without a base URL, or outside /api/cron", () => {
    expect(() => cronRequest("/api/cron/x", { URL: "https://a.b" })).toThrow(/CRON_SECRET/);
    expect(() => cronRequest("/api/cron/x", { CRON_SECRET: "s" })).toThrow(/URL/);
    expect(() => cronRequest("/api/health", { URL: "https://a.b", CRON_SECRET: "s" })).toThrow(
      /non-cron/,
    );
  });

  it("reports the route's response and never throws on network failure", async () => {
    const env = { URL: "https://a.b", CRON_SECRET: "s" };
    const okFetch = vi.fn(async () => new Response(JSON.stringify({ ok: true, expired: 2 })));
    const ok = await triggerCron("/api/cron/expire-holds", env, okFetch as unknown as typeof fetch);
    expect(ok).toMatchObject({ ok: true, status: 200, body: { ok: true, expired: 2 } });
    expect(okFetch).toHaveBeenCalledWith(
      "https://a.b/api/cron/expire-holds",
      expect.objectContaining({ headers: expect.objectContaining({ authorization: "Bearer s" }) }),
    );

    const failing = vi.fn(async () => {
      throw new Error("ECONNRESET");
    });
    const failed = await triggerCron(
      "/api/cron/expire-holds",
      env,
      failing as unknown as typeof fetch,
    );
    expect(failed).toMatchObject({ ok: false, status: 0, error: "ECONNRESET" });
  });
});
