import { expect, test, type Page } from "@playwright/test";

/** On the mobile project the account controls live inside the collapsed menu. */
async function openMenuIfCollapsed(page: Page) {
  const menu = page.getByRole("button", { name: "Menu" });
  if (await menu.isVisible()) await menu.click();
}

const DEMO_PASSWORD = "RideKmer-Demo-2026!";

test.describe("authentication and authorisation", () => {
  test("customer can register, land on the account page and sign out", async ({ page }) => {
    const email = `e2e-${Date.now()}@ridekmer.test`;
    await page.goto("/fr/register");
    await page.getByLabel("Nom complet").fill("E2E Client");
    await page.getByLabel("Adresse e-mail").fill(email);
    await page.getByLabel("Mot de passe", { exact: true }).fill("Motdepasse-e2e-2026");
    await page.getByLabel(/J'accepte/).check();
    await page.getByRole("button", { name: "Créer mon compte" }).click();
    await expect(page).toHaveURL(/\/fr\/account$/);
    await expect(page.getByText("Bienvenue, E2E Client")).toBeVisible();
    await expect(page.getByText("Client", { exact: true })).toBeVisible();
    await openMenuIfCollapsed(page);
    await page.getByRole("button", { name: "Se déconnecter", exact: true }).first().click();
    await expect(page).toHaveURL(/\/fr$/);
  });

  test("protected pages redirect anonymous visitors to login", async ({ page }) => {
    await page.goto("/fr/account");
    await expect(page).toHaveURL(/\/fr\/login\?returnTo=/);
    await page.goto("/en/admin");
    await expect(page).toHaveURL(/\/en\/login/);
  });

  test("demo customer cannot open the administration area", async ({ page }) => {
    await page.goto("/fr/login");
    await page.getByLabel("Adresse e-mail").fill("demo.customer@ridekmer.test");
    await page.getByLabel("Mot de passe").fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page).toHaveURL(/\/fr\/account$/);
    await page.goto("/fr/admin");
    await expect(page).toHaveURL(/\/fr\/account\?forbidden=1/);
    await expect(page.getByText("Vous n'avez pas l'autorisation")).toBeVisible();
  });

  test("demo administrator reaches the dashboard, user list and audit log", async ({ page }) => {
    await page.goto("/en/login");
    await page.getByLabel("Email address").fill("demo.admin@ridekmer.test");
    await page.getByLabel("Password").fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    // Staff land straight on the administration, which lists every task of the role.
    await expect(page).toHaveURL(/\/en\/admin$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Administration");
    await expect(page.getByText("Registered users")).toBeVisible();
    await expect(page.getByRole("heading", { name: "What you can do" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Users and roles/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Owner payouts/ })).toBeVisible();
    await page.goto("/en/admin/users?q=demo.customer");
    await expect(page.getByRole("cell", { name: "demo.customer@ridekmer.test" })).toBeVisible();
    await page.goto("/en/admin/audit");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Audit log");
  });

  test("wrong password shows a localised error", async ({ page }) => {
    await page.goto("/fr/login");
    await page.getByLabel("Adresse e-mail").fill("demo.customer@ridekmer.test");
    await page.getByLabel("Mot de passe").fill("wrong-password-123");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText(
      "E-mail ou mot de passe incorrect",
    );
  });
});
