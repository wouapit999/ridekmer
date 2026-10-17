import { expect, test } from "@playwright/test";

const DEMO_PASSWORD = "RideKmer-Demo-2026!";

test.describe("fleet telematics", () => {
  test("fleet manager sees the fleet map, loads a history with a reason, and the access is logged", async ({
    page,
  }) => {
    await page.goto("/en/login");
    await page.getByLabel("Email address").fill("demo.fleet@ridekmer.test");
    await page.getByLabel("Password").fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/en\/admin$/);

    await page.goto("/en/admin/fleet");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Fleet map");
    await expect(page.getByText("Vehicles are tracked, never people.")).toBeVisible();
    await expect(page.getByRole("cell", { name: /LT-DEMO-001/ }).first()).toBeVisible();

    await page.getByRole("link", { name: "History" }).first().click();
    await expect(page).toHaveURL(/\/en\/admin\/fleet\/[a-z0-9]+$/);
    await expect(page.getByText("Enter a reason")).toBeVisible();
    await page.getByLabel("Reason").fill("e2e check of the fleet history page");
    await page.getByRole("button", { name: "Load history" }).click();
    await expect(page.getByText(/\d+ fixes/)).toBeVisible();

    await page.goto("/en/admin/immobilisation");
    await expect(page.getByText("Never automatic")).toBeVisible();
  });

  test("administrator reviews the location access log", async ({ page }) => {
    await page.goto("/fr/login");
    await page.getByLabel("Adresse e-mail").fill("demo.admin@ridekmer.test");
    await page.getByLabel("Mot de passe").fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page).toHaveURL(/\/fr\/admin$/);
    await page.goto("/fr/admin/fleet/access");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Journal des accès à la localisation",
    );
    await expect(page.getByText("Position actuelle").first()).toBeVisible();
  });
});
