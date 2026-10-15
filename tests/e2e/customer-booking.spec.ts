import { expect, test } from "@playwright/test";

const DEMO_PASSWORD = "RideKmer-Demo-2026!";

function isoDate(daysFromNow: number): string {
  return new Date(Date.now() + daysFromNow * 86_400_000).toISOString().slice(0, 10);
}

test.describe("customer booking", () => {
  test("customer searches, gets a quote, books and cancels", async ({ page }) => {
    test.setTimeout(90_000);
    const pickup = isoDate(8);
    const ret = isoDate(10);

    await page.goto("/fr/login");
    await page.getByLabel("Adresse e-mail").fill("demo.customer@ridekmer.test");
    await page.getByLabel("Mot de passe").fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page).toHaveURL(/\/fr\/account$/);

    // Search with dates and open a demo vehicle (seeded RideKmer-owned Corolla)
    await page.goto(
      `/fr/cars?pickupDate=${pickup}&pickupTime=09:00&returnDate=${ret}&returnTime=09:00&drive=chauffeur&make=Toyota`,
    );
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Voitures disponibles");
    await page.getByRole("link", { name: "Voir les détails →" }).first().click();
    await expect(page).toHaveURL(/\/fr\/cars\/[a-z0-9]+/);

    // Quote is shown from the query parameters, then book
    await expect(page.getByText("Détail du prix")).toBeVisible();
    await expect(page.getByText("Total à payer")).toBeVisible();
    await page.getByRole("link", { name: "Réserver cette voiture" }).click();
    await expect(page).toHaveURL(/\/fr\/book\//);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Confirmez votre réservation",
    );
    await expect(page.getByText(/Bloqué jusqu'à/)).toBeVisible();
    await page.getByLabel(/J'accepte la/).check();
    await page.getByRole("button", { name: "Confirmer la réservation" }).click();

    // Booking detail: awaiting payment
    await expect(page).toHaveURL(/\/fr\/account\/bookings\/[a-z0-9]+$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Réservation RK-");
    await expect(page.getByText("En attente de paiement").first()).toBeVisible();
    await expect(page.getByText(/Paiement attendu avant le/)).toBeVisible();
    await expect(page.getByText("Remboursement", { exact: false })).toHaveCount(0);

    // Pay with the simulated MTN Mobile Money provider: the booking is only confirmed after
    // the signed (mock) webhook is verified server-side.
    await page.getByRole("link", { name: "Payer maintenant" }).first().click();
    await expect(page).toHaveURL(/\/account\/bookings\/[a-z0-9]+\/pay$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Payer la réservation");
    await page.getByLabel("MTN Mobile Money").check();
    await page.getByLabel("Numéro Mobile Money").fill("677 12 34 56");
    await page.getByRole("button", { name: "Payer maintenant" }).click();
    await expect(page.getByText("En attente du paiement")).toBeVisible();
    await page.getByRole("button", { name: "Simuler l'approbation" }).click();
    await expect(page.getByText("Cette réservation est payée et confirmée.")).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole("link", { name: "Retour à la réservation" }).click();
    await expect(page).toHaveURL(/\/fr\/account\/bookings\/[a-z0-9]+$/);
    await expect(page.getByText("Confirmée", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Payé", { exact: true }).first()).toBeVisible();

    // Cancel (free: pickup is 8 days away) — opens a refund request for finance.
    await page.getByLabel("Motif").fill("Changement de programme");
    await page.getByRole("button", { name: "Confirmer l'annulation" }).click();
    // The page re-renders with the new status; the cancel form disappears.
    await expect(page.getByRole("button", { name: "Confirmer l'annulation" })).toHaveCount(0);
    await expect(page.getByText("Annulée", { exact: true }).first()).toBeVisible();
  });

  test("the same dates cannot be booked twice while a booking is pending", async ({
    page,
    browser,
  }, testInfo) => {
    test.setTimeout(90_000);
    // Each project and each run book a different window: pending bookings from earlier local
    // runs are only expired by the cron job, which does not run during tests.
    const runOffset = (Math.floor(Date.now() / 60_000) % 150) * 2;
    const offset = 15 + runOffset + (testInfo.project.name.startsWith("mobile") ? 0 : 1);
    const pickup = isoDate(offset);
    const ret = isoDate(offset + 1);
    await page.goto("/fr/login");
    await page.getByLabel("Adresse e-mail").fill("demo.customer@ridekmer.test");
    await page.getByLabel("Mot de passe").fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page).toHaveURL(/\/fr\/account$/);
    await page.goto(
      `/fr/cars?pickupDate=${pickup}&pickupTime=09:00&returnDate=${ret}&returnTime=09:00&drive=chauffeur&make=Hyundai`,
    );
    const detailLink = page.getByRole("link", { name: "Voir les détails →" }).first();
    await detailLink.click();
    await expect(page).toHaveURL(/\/fr\/cars\/[a-z0-9]+/);
    const vehicleUrl = page.url();
    await page.getByRole("link", { name: "Réserver cette voiture" }).click();
    await page.getByLabel(/J'accepte la/).check();
    await page.getByRole("button", { name: "Confirmer la réservation" }).click();
    await expect(page).toHaveURL(/\/fr\/account\/bookings\//);

    // A second customer sees the vehicle as unavailable for the same dates.
    const other = await browser.newContext({ locale: "fr-CM", timezoneId: "Africa/Douala" });
    const page2 = await other.newPage();
    await page2.goto("/fr/login");
    await page2.getByLabel("Adresse e-mail").fill("demo.owner@ridekmer.test");
    await page2.getByLabel("Mot de passe").fill(DEMO_PASSWORD);
    await page2.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page2).toHaveURL(/\/fr\/account$/);
    await page2.goto(vehicleUrl);
    await expect(page2.getByText("Le véhicule n'est pas disponible à ces dates.")).toBeVisible();
    await other.close();
  });
});
