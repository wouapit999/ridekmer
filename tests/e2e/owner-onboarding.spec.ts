import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

const DEMO_PASSWORD = "RideKmer-Demo-2026!";
const fixture = (name: string) => path.join(__dirname, "fixtures", name);

async function login(page: Page, email: string) {
  await page.goto("/fr/login");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await expect(page).toHaveURL(/\/fr\/account$/);
}

test.describe("owner onboarding and vehicle approval", () => {
  test("owner registers, completes onboarding, submits a vehicle; admin reviews and approves", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const email = `e2e-owner-${Date.now()}@ridekmer.test`;
    const plate = `E2E-${Date.now().toString().slice(-6)}`;

    // 1. Register as an owner
    await page.goto("/fr/register?intent=owner");
    await page.getByLabel("Nom complet").fill("E2E Propriétaire");
    await page.getByLabel("Adresse e-mail").fill(email);
    await page.getByLabel("Mot de passe", { exact: true }).fill(DEMO_PASSWORD);
    await page.getByLabel(/J'accepte/).check();
    await page.getByRole("button", { name: "Créer mon compte" }).click();
    await expect(page).toHaveURL(/\/fr\/owner$/);

    // 2. Profile step
    await page.goto("/fr/owner/onboarding?step=profile");
    await page.getByLabel("Prénom").fill("E2E");
    await page.getByLabel("Nom", { exact: true }).fill("Propriétaire");
    await page.getByRole("button", { name: "Enregistrer et continuer" }).click();
    await expect(page.getByText("Profil enregistré.")).toBeVisible();

    // 3. Payout step
    await page.goto("/fr/owner/onboarding?step=payout");
    await page.getByLabel("Numéro Mobile Money").fill("677123456");
    await page.getByLabel("Titulaire du compte").fill("E2E Propriétaire");
    await page.getByRole("button", { name: "Enregistrer et continuer" }).click();
    await expect(page.getByText("Coordonnées enregistrées.")).toBeVisible();

    // 4. KYC document
    await page.goto("/fr/owner/onboarding?step=documents");
    await page.getByLabel("Type de document").selectOption("owner_national_id");
    await page.getByLabel(/Fichier/).setInputFiles(fixture("sample.pdf"));
    await page.getByLabel("Numéro du document").fill("SYN-ID-0001");
    await page.getByLabel("Date d'expiration").fill("2030-01-01");
    await page.getByRole("button", { name: "Téléverser" }).click();
    await expect(page.getByText("Document téléversé.")).toBeVisible();

    // 5. Agreement
    await page.goto("/fr/owner/onboarding?step=agreement");
    await page.getByLabel(/J'ai lu et j'accepte/).check();
    await page.getByRole("button", { name: "Accepter le contrat" }).click();
    await expect(page.getByText(/Contrat accepté/)).toBeVisible();

    // 6. Vehicle basics
    await page.goto("/fr/owner/vehicles/new");
    await page.getByLabel("Immatriculation").fill(plate);
    await page.getByLabel("Marque").fill("Hyundai");
    await page.getByLabel("Modèle").fill("i10");
    await page.getByLabel("Année").fill("2021");
    await page.getByRole("button", { name: "Enregistrer et continuer" }).click();
    await expect(page).toHaveURL(/\/edit\?step=equipment/);

    // 7. Equipment → location → pricing
    await page.getByLabel("Climatisation").check();
    await page.getByRole("button", { name: "Enregistrer et continuer" }).click();
    await expect(page).toHaveURL(/step=location/);
    await page.getByRole("button", { name: "Enregistrer et continuer" }).click();
    await expect(page).toHaveURL(/step=pricing/);
    await page.getByLabel("Prix journalier (XAF)").fill("25000");
    await page.getByLabel("Caution (XAF)").fill("100000");
    await page.getByRole("button", { name: "Enregistrer et continuer" }).click();
    await expect(page).toHaveURL(/step=photos/);

    // 8. Photo
    await page.getByLabel("Photos", { exact: true }).setInputFiles(fixture("sample.jpg"));
    await page.getByRole("button", { name: "Téléverser les photos" }).click();
    await expect(page.getByText("1 photo")).toBeVisible();

    // 9. Documents (all mandatory vehicle documents)
    await page.goto(page.url().replace(/step=\w+/, "step=documents"));
    const mandatoryKeys = [
      "vehicle_registration_certificate",
      "proof_of_ownership",
      "motor_insurance_certificate",
      "technical_inspection_certificate",
      "vehicle_tax_vignette",
    ];
    for (const [index, key] of mandatoryKeys.entries()) {
      await page.getByLabel("Type de document").selectOption(key);
      await page.getByLabel(/Fichier/).setInputFiles(fixture("sample.pdf"));
      await page.getByLabel("Numéro du document").fill(`SYN-${key.slice(0, 6).toUpperCase()}`);
      await page.getByLabel("Date d'expiration").fill("2028-06-30");
      await page.getByRole("button", { name: "Téléverser" }).click();
      // Each uploaded type shows a "Soumis" badge in the document list below the form.
      await expect(page.locator("ul li").getByText("Soumis", { exact: true })).toHaveCount(
        index + 1,
      );
    }

    // 10. Arrangement and submit
    await page.goto(page.url().replace(/step=\w+/, "step=arrangement"));
    await page.getByRole("button", { name: "Enregistrer et continuer" }).click();
    await expect(page).toHaveURL(/step=review/);
    await page.getByRole("button", { name: "Soumettre pour vérification" }).click();
    await expect(page).toHaveURL(/\/fr\/owner\/vehicles\/[a-z0-9]+$/);
    await expect(page.getByText("Soumis", { exact: true }).first()).toBeVisible();
    const vehicleUrl = page.url();
    const vehicleId = vehicleUrl.split("/").pop()!;

    // 11. Admin: verify documents and approve
    await page
      .getByRole("button", { name: "Menu" })
      .isVisible()
      .then(async (v) => v && (await page.getByRole("button", { name: "Menu" }).click()));
    await page.getByRole("button", { name: "Se déconnecter", exact: true }).first().click();
    await login(page, "demo.fleet@ridekmer.test");
    await page.goto(`/fr/admin/vehicles/${vehicleId}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(plate);
    const verifyButtons = page.getByRole("button", { name: "Valider" });
    const count = await verifyButtons.count();
    expect(count).toBeGreaterThanOrEqual(5);
    for (let i = 0; i < count; i += 1) {
      await page.getByRole("button", { name: "Valider" }).first().click();
      await expect(page.getByRole("button", { name: "Valider" })).toHaveCount(count - i - 1);
    }
    await page.getByLabel("Motif (enregistré dans le journal d'audit)").fill("Dossier complet");
    await page.getByRole("button", { name: "Approuver et publier" }).click();
    await expect(page.getByText("Véhicule approuvé et publié.")).toBeVisible();

    // 12. The vehicle is now visible in the public catalogue
    await page.goto(`/fr/cars?make=Hyundai`);
    await expect(page.getByText("Hyundai i10").first()).toBeVisible();
  });
});
