import { describe, expect, it } from "vitest";

import {
  MemoryNotificationProvider,
  NOTIFICATION_TEMPLATES,
  findTemplate,
  renderTemplate,
} from "@ridekmer/notifications";

const REQUIRED = [
  "otp",
  "account_verification",
  "vehicle_submitted",
  "vehicle_approved",
  "document_rejected",
  "document_expiry",
  "booking_created",
  "payment_pending",
  "payment_successful",
  "booking_confirmed",
  "upcoming_pickup",
  "return_reminder",
  "late_return",
  "booking_extension",
  "booking_cancelled",
  "refund_update",
  "owner_payout",
  "maintenance_update",
  "incident_update",
];

describe("notification templates", () => {
  it("cover every event from the brief in French and English", () => {
    for (const key of REQUIRED) {
      const t = findTemplate(key);
      expect(t, key).toBeDefined();
      const variants = [t!.email, t!.sms, t!.inApp].filter(Boolean);
      expect(variants.length, key).toBeGreaterThan(0);
      for (const v of variants) {
        expect(v).toHaveProperty("fr");
        expect(v).toHaveProperty("en");
      }
    }
    expect(NOTIFICATION_TEMPLATES.length).toBeGreaterThanOrEqual(REQUIRED.length);
  });

  it("renders placeholders and leaves unknown ones empty", () => {
    expect(
      renderTemplate("Code {{code}} in {{minutes}} min {{unknown}}", {
        code: "123456",
        minutes: 5,
      }),
    ).toBe("Code 123456 in 5 min ");
  });

  it("captures messages in the memory provider for tests", async () => {
    const p = new MemoryNotificationProvider();
    await p.sendSms({ to: "+237677123456", text: "hi" });
    expect(p.sms).toHaveLength(1);
  });
});
