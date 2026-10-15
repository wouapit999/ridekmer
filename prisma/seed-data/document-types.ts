import type { DocumentSubjectType } from "../../src/generated/prisma/enums";

export interface DocumentTypeSeed {
  key: string;
  subjectType: DocumentSubjectType;
  nameEn: string;
  nameFr: string;
  descriptionEn?: string;
  descriptionFr?: string;
  isMandatory: boolean;
  requiresExpiry: boolean;
  requiresNumber: boolean;
  blocksVehicleWhenExpired: boolean;
}

/** Editable defaults; administrators can change them in the portal. */
export const DOCUMENT_TYPE_SEED: DocumentTypeSeed[] = [
  {
    key: "vehicle_registration_certificate",
    subjectType: "VEHICLE",
    nameEn: "Vehicle registration certificate (carte grise)",
    nameFr: "Certificat d'immatriculation (carte grise)",
    isMandatory: true,
    requiresExpiry: false,
    requiresNumber: true,
    blocksVehicleWhenExpired: false,
  },
  {
    key: "proof_of_ownership",
    subjectType: "VEHICLE",
    nameEn: "Proof of ownership",
    nameFr: "Preuve de propriété",
    isMandatory: true,
    requiresExpiry: false,
    requiresNumber: false,
    blocksVehicleWhenExpired: false,
  },
  {
    key: "motor_insurance_certificate",
    subjectType: "VEHICLE",
    nameEn: "Motor insurance certificate",
    nameFr: "Attestation d'assurance automobile",
    isMandatory: true,
    requiresExpiry: true,
    requiresNumber: true,
    blocksVehicleWhenExpired: true,
  },
  {
    key: "technical_inspection_certificate",
    subjectType: "VEHICLE",
    nameEn: "Technical inspection certificate",
    nameFr: "Certificat de visite technique",
    isMandatory: true,
    requiresExpiry: true,
    requiresNumber: true,
    blocksVehicleWhenExpired: true,
  },
  {
    key: "vehicle_tax_vignette",
    subjectType: "VEHICLE",
    nameEn: "Vehicle tax / vignette",
    nameFr: "Vignette / taxe automobile",
    isMandatory: true,
    requiresExpiry: true,
    requiresNumber: false,
    blocksVehicleWhenExpired: true,
  },
  {
    key: "vehicle_management_agreement",
    subjectType: "VEHICLE",
    nameEn: "Vehicle-management agreement",
    nameFr: "Contrat de gestion du véhicule",
    isMandatory: true,
    requiresExpiry: false,
    requiresNumber: false,
    blocksVehicleWhenExpired: false,
  },
  {
    key: "maintenance_records",
    subjectType: "VEHICLE",
    nameEn: "Maintenance records",
    nameFr: "Carnet d'entretien",
    isMandatory: false,
    requiresExpiry: false,
    requiresNumber: false,
    blocksVehicleWhenExpired: false,
  },
  {
    key: "gps_installation_consent",
    subjectType: "VEHICLE",
    nameEn: "GPS installation and consent record",
    nameFr: "Procès-verbal d'installation GPS et consentement",
    isMandatory: false,
    requiresExpiry: false,
    requiresNumber: false,
    blocksVehicleWhenExpired: false,
  },
  {
    key: "owner_national_id",
    subjectType: "OWNER",
    nameEn: "Owner national identity document",
    nameFr: "Pièce d'identité nationale du propriétaire",
    isMandatory: true,
    requiresExpiry: true,
    requiresNumber: true,
    blocksVehicleWhenExpired: false,
  },
  {
    key: "owner_proof_of_address",
    subjectType: "OWNER",
    nameEn: "Owner proof of address",
    nameFr: "Justificatif de domicile du propriétaire",
    isMandatory: true,
    requiresExpiry: false,
    requiresNumber: false,
    blocksVehicleWhenExpired: false,
  },
  {
    key: "company_registration",
    subjectType: "COMPANY",
    nameEn: "Company registration document (RCCM)",
    nameFr: "Registre du commerce (RCCM)",
    isMandatory: true,
    requiresExpiry: false,
    requiresNumber: true,
    blocksVehicleWhenExpired: false,
  },
  {
    key: "taxpayer_identification",
    subjectType: "COMPANY",
    nameEn: "Taxpayer identification (NIU)",
    nameFr: "Numéro d'identifiant unique (NIU)",
    isMandatory: true,
    requiresExpiry: false,
    requiresNumber: true,
    blocksVehicleWhenExpired: false,
  },
  {
    key: "customer_identity_document",
    subjectType: "CUSTOMER",
    nameEn: "Customer identity document",
    nameFr: "Pièce d'identité du client",
    isMandatory: true,
    requiresExpiry: true,
    requiresNumber: true,
    blocksVehicleWhenExpired: false,
  },
  {
    key: "customer_driving_licence",
    subjectType: "CUSTOMER",
    nameEn: "Driving licence",
    nameFr: "Permis de conduire",
    isMandatory: true,
    requiresExpiry: true,
    requiresNumber: true,
    blocksVehicleWhenExpired: false,
  },
];
