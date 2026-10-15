import type { SettingValueType } from "../../src/generated/prisma/enums";

export interface SystemSettingSeed {
  key: string;
  valueType: SettingValueType;
  value: string;
  descriptionEn: string;
  descriptionFr: string;
  category: string;
  isPublic?: boolean;
}

/** Placeholder business values — to be confirmed by the business owner (docs/OPEN_ITEMS.md). */
export const SYSTEM_SETTINGS_SEED: SystemSettingSeed[] = [
  {
    key: "commission.managed_bps",
    valueType: "INTEGER",
    value: "2000",
    descriptionEn: "RideKmer commission on fully managed vehicles (basis points)",
    descriptionFr: "Commission RideKmer sur les véhicules en gestion complète (points de base)",
    category: "pricing",
  },
  {
    key: "commission.self_managed_bps",
    valueType: "INTEGER",
    value: "1500",
    descriptionEn: "RideKmer commission on self-managed marketplace vehicles (basis points)",
    descriptionFr: "Commission RideKmer sur les véhicules autogérés (points de base)",
    category: "pricing",
  },
  {
    key: "pricing.service_fee_bps",
    valueType: "INTEGER",
    value: "500",
    descriptionEn: "Customer service fee (basis points of rental)",
    descriptionFr: "Frais de service client (points de base de la location)",
    category: "pricing",
    isPublic: true,
  },
  {
    key: "pricing.tax_bps",
    valueType: "INTEGER",
    value: "0",
    descriptionEn: "Tax applied to rentals (basis points) — pending accountant confirmation",
    descriptionFr:
      "Taxe appliquée aux locations (points de base) — en attente de confirmation comptable",
    category: "pricing",
    isPublic: true,
  },
  {
    key: "pricing.late_return_fee_xaf_per_day",
    valueType: "INTEGER",
    value: "25000",
    descriptionEn: "Late-return fee per started day",
    descriptionFr: "Frais de retard par jour entamé",
    category: "pricing",
    isPublic: true,
  },
  {
    key: "pricing.cleaning_fee_xaf",
    valueType: "INTEGER",
    value: "10000",
    descriptionEn: "Cleaning fee when returned dirty",
    descriptionFr: "Frais de nettoyage si retour sale",
    category: "pricing",
    isPublic: true,
  },
  {
    key: "pricing.additional_driver_fee_xaf_per_day",
    valueType: "INTEGER",
    value: "5000",
    descriptionEn: "Additional driver fee per day",
    descriptionFr: "Frais conducteur additionnel par jour",
    category: "pricing",
    isPublic: true,
  },
  {
    key: "pricing.fuel_adjustment_xaf_per_percent",
    valueType: "INTEGER",
    value: "900",
    descriptionEn: "Fuel adjustment per missing percent of fuel",
    descriptionFr: "Ajustement carburant par pourcent manquant",
    category: "pricing",
  },
  {
    key: "booking.hold_minutes",
    valueType: "INTEGER",
    value: "15",
    descriptionEn: "Checkout reservation hold duration (minutes)",
    descriptionFr: "Durée de blocage du véhicule pendant le paiement (minutes)",
    category: "booking",
  },
  {
    key: "booking.payment_timeout_minutes",
    valueType: "INTEGER",
    value: "30",
    descriptionEn: "Time allowed to complete payment before the booking expires",
    descriptionFr: "Délai de paiement avant expiration de la réservation",
    category: "booking",
  },
  {
    key: "booking.min_advance_hours",
    valueType: "INTEGER",
    value: "4",
    descriptionEn: "Minimum hours between booking and pickup",
    descriptionFr: "Délai minimum entre réservation et prise en charge (heures)",
    category: "booking",
    isPublic: true,
  },
  {
    key: "finance.dual_approval_threshold_xaf",
    valueType: "INTEGER",
    value: "200000",
    descriptionEn: "Refunds/payouts above this amount require two approvers",
    descriptionFr: "Remboursements/versements au-dessus de ce montant exigent deux approbateurs",
    category: "finance",
  },
  {
    key: "documents.alert_days",
    valueType: "JSON",
    value: "[60,30,14,7,0]",
    descriptionEn: "Days before expiry at which document alerts are sent",
    descriptionFr: "Jours avant expiration auxquels les alertes documentaires sont envoyées",
    category: "documents",
  },
  {
    key: "cancellation.free_hours_before_pickup",
    valueType: "INTEGER",
    value: "48",
    descriptionEn:
      "Free cancellation window before pickup (hours) — placeholder pending legal review",
    descriptionFr:
      "Annulation gratuite avant prise en charge (heures) — provisoire, en attente de revue juridique",
    category: "booking",
    isPublic: true,
  },
  {
    key: "cancellation.late_fee_bps",
    valueType: "INTEGER",
    value: "3000",
    descriptionEn: "Fee retained on late cancellation (basis points of rental)",
    descriptionFr: "Frais retenus en cas d'annulation tardive (points de base)",
    category: "booking",
    isPublic: true,
  },
  {
    key: "tracking.location_retention_days",
    valueType: "INTEGER",
    value: "90",
    descriptionEn: "Location history retention (days)",
    descriptionFr: "Durée de conservation de l'historique de localisation (jours)",
    category: "privacy",
  },
  {
    key: "privacy.customer_document_retention_days",
    valueType: "INTEGER",
    value: "1095",
    descriptionEn:
      "Retention of customer identity documents after last booking (days) — pending legal review",
    descriptionFr:
      "Conservation des pièces d'identité client après la dernière location (jours) — en attente de revue juridique",
    category: "privacy",
  },
  {
    key: "security.staff_mfa_required",
    valueType: "BOOLEAN",
    value: "true",
    descriptionEn: "Require MFA for staff roles",
    descriptionFr: "Exiger l'authentification à deux facteurs pour le personnel",
    category: "security",
  },
];
