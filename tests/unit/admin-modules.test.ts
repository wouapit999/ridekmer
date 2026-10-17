import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ADMIN_MODULE_GROUPS, ADMIN_MODULES, canOpenModule } from "@/features/admin/modules";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
import { ALL_PERMISSION_KEYS } from "@/server/auth/permissions";

type Overview = {
  groups: Record<string, string>;
  modules: Record<string, { title: string; body: string }>;
};

describe("admin task overview", () => {
  it("points every task at an existing admin page", () => {
    for (const m of ADMIN_MODULES) {
      const page = join(process.cwd(), "src/app/[locale]", m.href, "page.tsx");
      expect(existsSync(page), `${m.key} → ${m.href}`).toBe(true);
    }
  });

  it("uses real permissions and unique keys", () => {
    const keys = ADMIN_MODULES.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const m of ADMIN_MODULES) {
      for (const p of m.anyOf) expect(ALL_PERMISSION_KEYS).toContain(p);
      expect(ADMIN_MODULE_GROUPS).toContain(m.group);
    }
  });

  it("describes every task and group in both languages, with nav labels for sidebar items", () => {
    for (const messages of [en, fr]) {
      const overview = (messages.admin as unknown as { overview: Overview }).overview;
      const nav = messages.admin.nav as Record<string, string>;
      for (const g of ADMIN_MODULE_GROUPS) expect(overview.groups[g]).toBeTruthy();
      for (const m of ADMIN_MODULES) {
        expect(overview.modules[m.key]?.title, m.key).toBeTruthy();
        expect(overview.modules[m.key]?.body, m.key).toBeTruthy();
        if (m.nav) expect(nav[m.key], m.key).toBeTruthy();
      }
    }
  });

  it("opens a task when the role holds any of its permissions", () => {
    const payouts = ADMIN_MODULES.find((m) => m.key === "payouts")!;
    expect(canOpenModule(payouts, new Set(["payout.approve"]))).toBe(true);
    expect(canOpenModule(payouts, new Set(["booking.view_all"]))).toBe(false);
    expect(ADMIN_MODULES.every((m) => canOpenModule(m, new Set(ALL_PERMISSION_KEYS)))).toBe(true);
  });
});
