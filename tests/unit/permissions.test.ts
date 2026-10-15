import { describe, expect, it } from "vitest";

import {
  ALL_PERMISSION_KEYS,
  PERMISSIONS,
  ROLE_DEFINITIONS,
  STAFF_ROLE_KEYS,
  SUPER_ADMIN_ROLE,
} from "@/server/auth/permissions";

describe("permission catalogue", () => {
  it("defines all permissions required by the brief", () => {
    for (const key of [
      "vehicle.create",
      "vehicle.review",
      "vehicle.approve",
      "vehicle.suspend",
      "booking.create",
      "booking.cancel",
      "booking.override",
      "payment.view",
      "refund.request",
      "refund.approve",
      "payout.request",
      "payout.approve",
      "tracking.view_current",
      "tracking.view_history",
      "document.verify",
      "contract.manage",
      "report.export",
      "settings.manage",
      "user.suspend",
    ]) {
      expect(PERMISSIONS).toHaveProperty(key);
    }
  });

  it("defines the eleven roles with valid permission references", () => {
    expect(ROLE_DEFINITIONS.map((r) => r.key).sort()).toEqual(
      [
        "administrator",
        "chauffeur",
        "customer",
        "delivery_agent",
        "finance_officer",
        "fleet_manager",
        "operations_agent",
        "super_administrator",
        "support_agent",
        "vehicle_inspector",
        "vehicle_owner",
      ].sort(),
    );
    for (const role of ROLE_DEFINITIONS) {
      if (role.permissions === "*") continue;
      for (const p of role.permissions) expect(ALL_PERMISSION_KEYS).toContain(p);
    }
  });

  it("requires MFA for privileged staff roles and never for customers", () => {
    const byKey = Object.fromEntries(ROLE_DEFINITIONS.map((r) => [r.key, r]));
    for (const key of [
      "administrator",
      "super_administrator",
      "finance_officer",
      "fleet_manager",
      "operations_agent",
    ]) {
      expect(byKey[key]!.requiresMfa).toBe(true);
      expect(byKey[key]!.isStaff).toBe(true);
    }
    expect(byKey.customer!.requiresMfa).toBe(false);
    expect(byKey.vehicle_owner!.isStaff).toBe(false);
    expect(STAFF_ROLE_KEYS).toContain(SUPER_ADMIN_ROLE);
  });

  it("separates duties: administrators cannot execute payouts", () => {
    const admin = ROLE_DEFINITIONS.find((r) => r.key === "administrator")!;
    expect(admin.permissions).not.toContain("payout.process");
    const finance = ROLE_DEFINITIONS.find((r) => r.key === "finance_officer")!;
    expect(finance.permissions).toContain("payout.process");
    expect(finance.permissions).not.toContain("user.manage_roles");
  });
});
