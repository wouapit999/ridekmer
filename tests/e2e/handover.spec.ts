import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

const DEMO_PASSWORD = "RideKmer-Demo-2026!";
const fixture = path.join(__dirname, "fixtures", "sample.jpg");

function isoDate(daysFromNow: number): string {
  return new Date(Date.now() + daysFromNow * 86_400_000).toISOString().slice(0, 10);
}

async function login(page: Page, email: string) {
  await page.goto("/fr/login");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  // Customers land on their account, staff on the administration.
  await expect(page).toHaveURL(/\/fr\/(account|admin)$/);
}

test.describe("handover: agreement, pickup inspection, rental start", () => {
  test("customer pays and accepts the agreement; staff inspect and start the rental", async ({
    page,
    browser,
  }, testInfo) => {
    test.setTimeout(150_000);
    // Run-unique window on the managed RAV4 (chauffeur available) so suites never collide.
    // Seconds-based so two runs only collide when started in the same second.
    const runOffset = (Math.floor(Date.now() / 1000) % 1500) * 2;
    const offset = 320 + runOffset + (testInfo.project.name.startsWith("mobile") ? 0 : 1);
    const pickup = isoDate(offset);
    const ret = isoDate(offset + 1);

    await login(page, "demo.customer@ridekmer.test");
    await page.goto(
      `/fr/cars?pickupDate=${pickup}&pickupTime=09:00&returnDate=${ret}&returnTime=09:00&drive=chauffeur&make=Toyota&model=RAV4`,
    );
    await page.getByRole("link", { name: "Voir les détails →" }).first().click();
    await page.getByRole("link", { name: "Réserver cette voiture" }).click();
    await page.getByLabel(/J'accepte la/).check();
    await page.getByRole("button", { name: "Confirmer la réservation" }).click();
    await expect(page).toHaveURL(/\/fr\/account\/bookings\/[a-z0-9]+$/);
    const bookingUrl = page.url();

    // Pay with the simulated provider → confirmed → agreement generated.
    await page.getByRole("link", { name: "Payer maintenant" }).first().click();
    await page.getByLabel("MTN Mobile Money").check();
    await page.getByLabel("Numéro Mobile Money").fill("677 12 34 56");
    await page.getByRole("button", { name: "Payer maintenant" }).click();
    await page.getByRole("button", { name: "Simuler l'approbation" }).click();
    await expect(page.getByText("Cette réservation est payée et confirmée.")).toBeVisible({
      timeout: 15_000,
    });

    await page.goto(bookingUrl);
    await page.getByRole("link", { name: "Lire et accepter" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Contrat de location RK-");
    await expect(page.getByText("Contrat de location de véhicule — RideKmer")).toBeVisible();
    await page.getByLabel("J'ai lu le contrat et j'en accepte les conditions.").check();
    await page.getByRole("button", { name: "Accepter le contrat" }).click();
    // The form shows a success message, or the page re-renders with the accepted banner.
    await expect(
      page.getByText(/Contrat accepté\. Merci\.|Vous avez accepté ce contrat/),
    ).toBeVisible();

    // Staff: the rental cannot start before the pickup inspection.
    const staff = await browser.newContext({ locale: "fr-CM", timezoneId: "Africa/Douala" });
    const admin = await staff.newPage();
    await login(admin, "demo.ops@ridekmer.test");
    const adminBookingUrl = bookingUrl.replace("/account/bookings/", "/admin/bookings/");
    await admin.goto(adminBookingUrl);
    await admin.getByRole("button", { name: "Démarrer la location (prise en charge)" }).click();
    await expect(admin.getByText("Une inspection soumise est requise")).toBeVisible();

    await admin.getByRole("button", { name: "Démarrer l'inspection de prise en charge" }).click();
    await expect(admin).toHaveURL(/\/fr\/admin\/inspections\/[a-z0-9]+$/);
    await admin.getByLabel("Kilométrage (km)").fill("45210");
    await admin.getByLabel("Niveau de carburant (%)").fill("100");
    await admin.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await expect(admin.getByText("Enregistré.")).toBeVisible();
    await admin.getByLabel("Fichiers").setInputFiles([fixture, fixture, fixture, fixture]);
    await admin.getByRole("button", { name: "Ajouter les photos" }).click();
    await expect(admin.getByText("Photos ajoutées.")).toBeVisible();
    await admin.getByRole("button", { name: "Soumettre", exact: true }).click();
    // Submission freezes the inspection; the page re-renders in its read-only state.
    await expect(
      admin.getByText(
        /Inspection soumise\.|Cette inspection est soumise et ne peut plus être modifiée\./,
      ),
    ).toBeVisible();

    await admin.goto(adminBookingUrl);
    await admin.getByRole("button", { name: "Démarrer la location (prise en charge)" }).click();
    await expect(admin.getByText("Location démarrée.")).toBeVisible();
    await staff.close();

    // Customer acknowledges the pickup inspection.
    await page.goto(bookingUrl);
    await expect(page.getByText("En cours", { exact: true }).first()).toBeVisible();
    await page.getByRole("link", { name: "Vérifier et reconnaître" }).click();
    await page.getByRole("button", { name: "Je reconnais" }).click();
    // Either the inline confirmation or the re-rendered "Reconnue" status is acceptable.
    await expect(
      page.getByText(/Merci, votre reconnaissance est enregistrée\.|^Reconnue$/).first(),
    ).toBeVisible();
  });
});
