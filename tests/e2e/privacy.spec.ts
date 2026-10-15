import { expect, test } from "@playwright/test";

test.describe("privacy self-service", () => {
  test("a customer can export their data, request deletion and cancel it", async ({ page }) => {
    const email = `e2e-privacy-${Date.now()}@ridekmer.test`;
    await page.goto("/fr/register");
    await page.getByLabel("Nom complet").fill("E2E Privacy");
    await page.getByLabel("Adresse e-mail").fill(email);
    await page.getByLabel("Mot de passe", { exact: true }).fill("Motdepasse-e2e-2026");
    await page.getByLabel(/J'accepte/).check();
    await page.getByRole("button", { name: "Créer mon compte" }).click();
    await expect(page).toHaveURL(/\/fr\/account$/);

    const exportResponse = await page.request.get("/api/account/export");
    expect(exportResponse.status()).toBe(200);
    expect(exportResponse.headers()["content-disposition"]).toContain("attachment");
    const data = await exportResponse.json();
    expect(data.user.email).toBe(email);
    expect(JSON.stringify(data)).not.toMatch(/NumberEnc|credentialsEnc|BankAccountEnc/);

    await page.goto("/fr/account/privacy");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Confidentialité");
    await page.getByLabel(/Je comprends/).check();
    await page.getByRole("button", { name: "Demander la suppression" }).click();
    await expect(page.getByText(/Suppression demandée/).first()).toBeVisible();

    await page.goto("/fr/account/privacy");
    await expect(page.getByText("Suppression demandée").first()).toBeVisible();
    await page.getByRole("button", { name: "Annuler la demande de suppression" }).click();
    // The action revalidates the page, so either the confirmation or the fresh form is shown.
    await expect(
      page
        .getByText(/annulée/)
        .or(page.getByRole("button", { name: "Demander la suppression" }))
        .first(),
    ).toBeVisible();
    await page.goto("/fr/account/privacy");
    await expect(page.getByRole("button", { name: "Demander la suppression" })).toBeVisible();
  });

  test("anonymous visitors cannot export data", async ({ request }) => {
    const response = await request.get("/api/account/export");
    expect(response.status()).toBe(401);
  });
});
