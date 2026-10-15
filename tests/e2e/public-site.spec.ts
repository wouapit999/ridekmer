import { expect, test, type Page } from "@playwright/test";

async function openMenuIfCollapsed(page: Page) {
  const menu = page.getByRole("button", { name: "Menu" });
  if (await menu.isVisible()) await menu.click();
}

test.describe("public website", () => {
  test("home page renders in French by default and switches to English", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/fr$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "La voiture qu'il vous faut",
    );
    await openMenuIfCollapsed(page);
    await expect(page.getByRole("button", { name: "EN", exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "EN", exact: true }).first().click();
    await expect(page).toHaveURL(/\/en$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("The car you need");
  });

  test("search form leads to the catalogue with XAF prices", async ({ page }) => {
    await page.goto("/fr");
    await page.getByRole("button", { name: "Voir les voitures disponibles" }).click();
    await expect(page).toHaveURL(/\/fr\/cars/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Voitures disponibles");
    await expect(page.getByText("XAF").first()).toBeVisible();
  });

  test("static pages are reachable in both languages", async ({ page }) => {
    for (const path of [
      "/fr/how-it-works",
      "/en/partner",
      "/fr/faq",
      "/en/privacy",
      "/fr/contact",
      "/en/cancellation-policy",
    ]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    }
  });

  test("unknown pages return the localised 404", async ({ page }) => {
    const response = await page.goto("/fr/does-not-exist");
    expect(response?.status()).toBe(404);
    await expect(page.getByText("Page introuvable")).toBeVisible();
  });

  test("security headers and PWA manifest are served", async ({ request }) => {
    const home = await request.get("/fr");
    expect(home.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(home.headers()["x-frame-options"]).toBe("DENY");
    const manifest = await request.get("/manifest.webmanifest");
    expect(manifest.ok()).toBe(true);
    expect((await manifest.json()).name).toBe("RideKmer");
  });
});
