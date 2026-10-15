import { checksum, extractVariables } from "@ridekmer/contracts";

import type { PrismaClient } from "../../src/generated/prisma/client";

/**
 * Initial contract templates. PLACEHOLDER WORDING pending validation by qualified Cameroonian
 * counsel (docs/LEGAL_REVIEW_CHECKLIST.md). Publishing a new version never changes accepted
 * contracts: GeneratedContract rows keep their rendered copy and checksum.
 */
const OWNER_AGREEMENT_FR = `# Contrat de gestion de véhicule — {{platformName}}

**Version provisoire — en attente de validation juridique.**

Entre **{{platformName}}** (« la Plateforme ») et **{{ownerName}}** (« le Propriétaire »){{#if isCompany}}, représenté par {{representativeName}}{{/if}}, e-mail : {{ownerEmail}}.

## 1. Objet
Le Propriétaire confie à la Plateforme la mise en location de son ou ses véhicules selon l'arrangement choisi pour chaque véhicule : gestion complète ou place de marché autogérée.

## 2. Obligations du Propriétaire
- Fournir des documents valides (carte grise, assurance couvrant la location, visite technique, vignette) et les renouveler avant expiration.
- Garantir que le véhicule est en bon état de fonctionnement et déclarer tout dommage existant.
- Consentir à l'installation d'un traceur GPS professionnel.

## 3. Obligations de la Plateforme
- Vérifier les clients, encaisser les paiements, gérer les contrats et les inspections selon l'arrangement.
- Reverser les revenus du Propriétaire après déduction de la commission ({{commissionManagedPercent}} % en gestion complète, {{commissionSelfManagedPercent}} % en autogestion) et des dépenses approuvées.
- Fournir des relevés détaillés.

## 4. Entretien et dépenses
Les dépenses d'entretien supérieures au seuil défini par le Propriétaire nécessitent son approbation.

## 5. Suspension et retrait
Le Propriétaire peut demander la suspension ou le retrait d'un véhicule, sous réserve des réservations confirmées.

## 6. Données personnelles et géolocalisation
Les données sont traitées conformément à la politique de confidentialité. Les données de localisation ne sont accessibles qu'au personnel autorisé.

## 7. Acceptation
Acceptation électronique par clic le {{date}}. Cette acceptation est enregistrée avec des éléments de preuve (horodatage, adresse IP, navigateur) ; elle ne constitue pas une signature électronique certifiée.
`;

const OWNER_AGREEMENT_EN = `# Vehicle-management agreement — {{platformName}}

**Provisional version — pending legal validation.**

Between **{{platformName}}** ("the Platform") and **{{ownerName}}** ("the Owner"){{#if isCompany}}, represented by {{representativeName}}{{/if}}, email: {{ownerEmail}}.

## 1. Purpose
The Owner entrusts the Platform with renting out one or more vehicles under the arrangement chosen per vehicle: fully managed or self-managed marketplace.

## 2. Owner obligations
- Provide valid documents (registration certificate, insurance covering rental use, technical inspection, road tax) and renew them before expiry.
- Keep the vehicle roadworthy and declare any existing damage.
- Consent to the installation of a commercial GPS tracker.

## 3. Platform obligations
- Verify customers, collect payments, manage contracts and inspections according to the arrangement.
- Pay out the Owner's earnings after deducting the commission ({{commissionManagedPercent}} % fully managed, {{commissionSelfManagedPercent}} % self-managed) and approved expenses.
- Provide itemised statements.

## 4. Maintenance and expenses
Maintenance expenses above the threshold set by the Owner require the Owner's approval.

## 5. Suspension and withdrawal
The Owner may request suspension or withdrawal of a vehicle, subject to confirmed bookings.

## 6. Personal data and location
Data is processed according to the privacy notice. Location data is accessible only to authorised staff.

## 7. Acceptance
Electronic click-to-accept on {{date}}. The acceptance is recorded with evidence (timestamp, IP address, browser); it is not a certified electronic signature.
`;

const RENTAL_AGREEMENT_FR = `# Contrat de location de véhicule — {{platformName}}

**Version provisoire — en attente de validation juridique.** Référence : **{{reference}}**

Entre **{{platformName}}** (« le Loueur », agissant pour son compte ou pour le compte du propriétaire du véhicule) et **{{customerName}}** (« le Locataire »), e-mail : {{customerEmail}}.

## 1. Véhicule
{{vehicle}}, immatriculation {{registrationNumber}}{{#if chauffeur}}, mis à disposition **avec chauffeur**{{/if}}.

## 2. Durée et lieu
Du {{startAt}} au {{endAt}} ({{rentalDays}} jour(s)). Prise en charge : {{pickup}}. Toute prolongation doit être demandée via l'application et payée avant le nouveau terme.

## 3. Prix, caution et kilométrage
- Montant de la location : **{{totalRental}}**, payé avant la prise en charge.
- Caution : **{{deposit}}**, débitée puis remboursée après l'inspection de retour, déduction faite des frais justifiés (dommages non préexistants, carburant, kilométrage excédentaire, retard). Il ne s'agit pas d'une pré-autorisation.
- Kilométrage inclus : {{kmAllowance}} km par jour ; kilomètre supplémentaire : {{extraKmRate}}.

## 4. Obligations du Locataire
- Détenir un permis de conduire valide et être la seule personne à conduire, sauf conducteurs additionnels déclarés.
- Restituer le véhicule à la date, à l'heure et au lieu convenus, avec le même niveau de carburant.
- Signaler immédiatement tout accident, panne, vol ou dommage via l'application et, le cas échéant, obtenir un constat de police.
- Ne pas sous-louer, ne pas quitter le territoire camerounais sans accord écrit.

## 5. État des lieux
Une inspection contradictoire (photos, kilométrage, carburant, dommages) est réalisée à la prise en charge et au retour. Les dommages constatés au retour et absents à la prise en charge sont à la charge du Locataire dans la limite des conditions d'assurance.

## 6. Géolocalisation
Le véhicule peut être équipé d'un traceur GPS professionnel utilisé pour la sécurité du véhicule et l'assistance. Les données ne sont accessibles qu'au personnel autorisé, conformément à la politique de confidentialité.

## 7. Annulation
Selon la politique d'annulation en vigueur à la date de réservation.

## 8. Acceptation
Acceptation électronique par clic le {{date}}. Cette acceptation est enregistrée avec des éléments de preuve (horodatage, adresse IP, navigateur) ; elle ne constitue pas une signature électronique certifiée.
`;

const RENTAL_AGREEMENT_EN = `# Vehicle rental agreement — {{platformName}}

**Provisional version — pending legal validation.** Reference: **{{reference}}**

Between **{{platformName}}** ("the Lessor", acting for itself or on behalf of the vehicle owner) and **{{customerName}}** ("the Renter"), email: {{customerEmail}}.

## 1. Vehicle
{{vehicle}}, registration {{registrationNumber}}{{#if chauffeur}}, provided **with a chauffeur**{{/if}}.

## 2. Period and place
From {{startAt}} to {{endAt}} ({{rentalDays}} day(s)). Pickup: {{pickup}}. Any extension must be requested in the app and paid before the new end time.

## 3. Price, deposit and mileage
- Rental amount: **{{totalRental}}**, paid before pickup.
- Security deposit: **{{deposit}}**, debited and refunded after the return inspection, net of justified charges (new damage, fuel, excess kilometres, late return). It is not a pre-authorisation.
- Included mileage: {{kmAllowance}} km per day; extra kilometre: {{extraKmRate}}.

## 4. Renter obligations
- Hold a valid driving licence and be the only driver, except declared additional drivers.
- Return the vehicle at the agreed date, time and place with the same fuel level.
- Report any accident, breakdown, theft or damage immediately in the app and obtain a police report where applicable.
- No sub-letting; no travel outside Cameroon without written consent.

## 5. Inspections
A joint inspection (photos, mileage, fuel, damage) is carried out at pickup and at return. Damage found at return that was not present at pickup is charged to the Renter within the limits of the insurance terms.

## 6. Location tracking
The vehicle may carry a commercial GPS tracker used for vehicle security and assistance. Data is accessible only to authorised staff, as described in the privacy notice.

## 7. Cancellation
According to the cancellation policy in force on the booking date.

## 8. Acceptance
Electronic click-to-accept on {{date}}. The acceptance is recorded with evidence (timestamp, IP address, browser); it is not a certified electronic signature.
`;

export const CONTRACT_TEMPLATE_SEED = [
  {
    key: "owner_management_agreement",
    type: "OWNER_MANAGEMENT_AGREEMENT" as const,
    nameEn: "Owner vehicle-management agreement",
    nameFr: "Contrat de gestion de véhicule (propriétaire)",
    bodies: { fr: OWNER_AGREEMENT_FR, en: OWNER_AGREEMENT_EN },
  },
  {
    key: "customer_rental_agreement",
    type: "CUSTOMER_RENTAL_AGREEMENT" as const,
    nameEn: "Customer rental agreement",
    nameFr: "Contrat de location (client)",
    bodies: { fr: RENTAL_AGREEMENT_FR, en: RENTAL_AGREEMENT_EN },
  },
];

export async function seedContractTemplates(prisma: PrismaClient) {
  for (const t of CONTRACT_TEMPLATE_SEED) {
    const template = await prisma.contractTemplate.upsert({
      where: { key: t.key },
      update: { nameEn: t.nameEn, nameFr: t.nameFr },
      create: { key: t.key, type: t.type, nameEn: t.nameEn, nameFr: t.nameFr },
    });
    for (const locale of ["fr", "en"] as const) {
      const body = t.bodies[locale];
      await prisma.contractTemplateVersion.upsert({
        where: { templateId_version_locale: { templateId: template.id, version: 1, locale } },
        update: {},
        create: {
          templateId: template.id,
          version: 1,
          locale,
          bodyMarkdown: body,
          variables: extractVariables(body),
          checksumSha256: checksum(body),
          publishedAt: new Date(),
        },
      });
    }
  }
}
