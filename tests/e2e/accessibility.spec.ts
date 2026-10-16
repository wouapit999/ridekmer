import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const DEMO_PASSWORD = "RideKmer-Demo-2026!";

/**
 * Automated WCAG 2.1 A/AA scan with axe-core on representative pages. Automated checks catch
 * roughly a third of accessibility issues; manual keyboard and screen-reader testing remains
 * in docs/PRODUCTION_READINESS_CHECKLIST.md.
 */
async function scan(page: Page, path: string) {
  await page.goto(path);
  // Freeze CSS transitions so axe never samples a colour halfway through a hover/focus fade.
  await page.addStyleTag({ content: "*, *::before, *::after { transition: none !important; }" });
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .exclude("iframe")
    .analyze();
  const serious = results.violations.filter(
    (v) => v.impact === "critical" || v.impact === "serious",
  );
  if (process.env.A11Y_REPORT) {
    // Report mode (A11Y_REPORT=1): list every violation without failing, for triage.
    for (const v of results.violations) {
      for (const node of v.nodes) {
        const detail = node.any[0]?.data as { fgColor?: string; bgColor?: string } | undefined;
        console.info(
          `${path} | ${v.impact} | ${v.id} | ${node.target.join(" ")} | ${detail?.fgColor ?? ""}/${detail?.bgColor ?? ""} | ${node.html.slice(0, 120)}`,
        );
      }
    }
    return results.violations;
  }
  expect(
    serious,
    `${path}: ${serious.map((v) => `${v.id} (${v.nodes.length}) ${v.help}`).join("; ")}`,
  ).toEqual([]);
  return results.violations;
}

test.describe("accessibility (axe-core)", () => {
  test("public pages have no serious or critical violations", async ({ page }) => {
    for (const path of [
      "/fr",
      "/en",
      "/fr/cars",
      "/fr/how-it-works",
      "/fr/contact",
      "/en/faq",
      "/fr/login",
      "/fr/register",
      "/fr/offline",
    ]) {
      await scan(page, path);
    }
  });

  test("customer account pages have no serious or critical violations", async ({ page }) => {
    await page.goto("/fr/login");
    await page.getByLabel("Adresse e-mail").fill("demo.customer@ridekmer.test");
    await page.getByLabel("Mot de passe").fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page).toHaveURL(/\/fr\/account$/);
    for (const path of [
      "/fr/account",
      "/fr/account/documents",
      "/fr/account/bookings",
      "/fr/account/privacy",
      "/fr/account/security",
    ]) {
      await scan(page, path);
    }
  });

  test("administration pages have no serious or critical violations", async ({ page }) => {
    await page.goto("/en/login");
    await page.getByLabel("Email address").fill("demo.admin@ridekmer.test");
    await page.getByLabel("Password").fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/en\/account$/);
    for (const path of [
      "/en/admin",
      "/en/admin/bookings",
      "/en/admin/vehicles",
      "/en/admin/finance",
      "/en/admin/fleet",
      "/en/admin/data-requests",
      "/en/admin/settings/payments",
    ]) {
      await scan(page, path);
    }
  });
});
