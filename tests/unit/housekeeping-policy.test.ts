import { describe, expect, it } from "vitest";

import { DEFAULT_HOUSEKEEPING_POLICY, resolvePolicy } from "@/server/housekeeping";
import {
  anonymisedIdentity,
  BLOCKING_BOOKING_STATUSES,
  deletionDue,
} from "@/features/account/privacy-rules";

describe("housekeeping policy", () => {
  it("falls back to defaults when settings are missing or invalid", () => {
    expect(resolvePolicy([])).toEqual(DEFAULT_HOUSEKEEPING_POLICY);
    expect(
      resolvePolicy([
        { key: "privacy.notification_retention_days", value: "abc" },
        { key: "privacy.hold_retention_days", value: "0" },
      ]),
    ).toEqual(DEFAULT_HOUSEKEEPING_POLICY);
  });

  it("reads positive integers from settings", () => {
    const policy = resolvePolicy([
      { key: "privacy.notification_retention_days", value: "30" },
      { key: "privacy.webhook_event_retention_days", value: "400" },
      { key: "privacy.hold_retention_days", value: "7" },
    ]);
    expect(policy).toEqual({
      notificationRetentionDays: 30,
      webhookEventRetentionDays: 400,
      holdRetentionDays: 7,
    });
  });
});

describe("account deletion rules", () => {
  it("deletion becomes due exactly after the grace period", () => {
    const requested = new Date("2026-10-01T00:00:00Z");
    expect(deletionDue(requested, 30, new Date("2026-10-30T23:59:59Z"))).toBe(false);
    expect(deletionDue(requested, 30, new Date("2026-10-31T00:00:00Z"))).toBe(true);
  });

  it("anonymised identity contains no personal data and is unique per user", () => {
    const a = anonymisedIdentity("user_a");
    const b = anonymisedIdentity("user_b");
    expect(a.email).not.toBe(b.email);
    expect(a.email.endsWith("@anonymised.invalid")).toBe(true);
    expect(a.phoneNumber).toBeNull();
    expect(a.name).not.toMatch(/user_a/);
  });

  it("every in-flight booking status blocks deletion; terminal ones do not", () => {
    expect(BLOCKING_BOOKING_STATUSES).toContain("ACTIVE");
    expect(BLOCKING_BOOKING_STATUSES).toContain("CONFIRMED");
    expect(BLOCKING_BOOKING_STATUSES).not.toContain("COMPLETED");
    expect(BLOCKING_BOOKING_STATUSES).not.toContain("CANCELLED");
  });
});
