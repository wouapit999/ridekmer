import { expect, test } from "@playwright/test";

const DEMO_PASSWORD = "RideKmer-Demo-2026!";

test.describe("finance area", () => {
  test("administrator opens the finance dashboard, ledger, payouts, expenses and exports a CSV", async ({
    page,
  }) => {
    await page.goto("/en/login");
    await page.getByLabel("Email address").fill("demo.admin@ridekmer.test");
    await page.getByLabel("Password").fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/en\/account$/);

    await page.goto("/en/admin/finance");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Finance");
    await expect(page.getByText("Collected (payments)")).toBeVisible();
    await expect(page.getByText("Owed to owners (now)")).toBeVisible();

    await page.goto("/en/admin/finance/ledger");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Ledger");

    await page.goto("/en/admin/payouts");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Owner payouts");

    await page.goto("/en/admin/expenses");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Expenses");

    await page.goto("/en/admin/reports");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Reports");
    const response = await page.request.get(
      "/api/admin/reports/payments?from=2026-01-01&to=2030-12-31",
    );
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/csv");
    const body = await response.text();
    expect(body).toContain("booking,purpose,method");

    // Unknown reports are rejected; anonymous access is refused.
    expect((await page.request.get("/api/admin/reports/secrets")).status()).toBe(404);
    const anon = await page.context().browser()!.newContext();
    expect((await anon.request.get("/api/admin/reports/payments")).status()).toBe(403);
    await anon.close();
  });

  test("owner sees earnings, statements and payouts", async ({ page }) => {
    await page.goto("/fr/login");
    await page.getByLabel("Adresse e-mail").fill("demo.owner@ridekmer.test");
    await page.getByLabel("Mot de passe").fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page).toHaveURL(/\/fr\/account$/);
    await page.goto("/fr/owner/finance");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Revenus et versements");
    await expect(page.getByText("Disponible", { exact: true })).toBeVisible();
    await expect(page.getByText("Relevés mensuels")).toBeVisible();
  });
});
