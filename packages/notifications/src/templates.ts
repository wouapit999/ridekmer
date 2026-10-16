import type { Locale } from "./types";

/**
 * Bilingual notification templates. Variables use {{name}} placeholders. Templates are also
 * seeded into the NotificationTemplate table so administrators can adjust wording later; the
 * values here are the defaults and the fallback when the database copy is inactive.
 */
export interface TemplateDefinition {
  key: string;
  variables: string[];
  email?: Record<Locale, { subject: string; body: string }>;
  sms?: Record<Locale, string>;
  inApp?: Record<Locale, { title: string; body: string }>;
}

const T = (fr: string, en: string): Record<Locale, string> => ({ fr, en });

export const NOTIFICATION_TEMPLATES: TemplateDefinition[] = [
  {
    key: "otp",
    variables: ["code", "minutes"],
    sms: T(
      "RideKmer : votre code de vérification est {{code}}. Il expire dans {{minutes}} minutes. Ne le partagez jamais.",
      "RideKmer: your verification code is {{code}}. It expires in {{minutes}} minutes. Never share it.",
    ),
    email: {
      fr: {
        subject: "Votre code RideKmer",
        body: "Votre code de vérification est {{code}}. Il expire dans {{minutes}} minutes.",
      },
      en: {
        subject: "Your RideKmer code",
        body: "Your verification code is {{code}}. It expires in {{minutes}} minutes.",
      },
    },
  },
  {
    key: "account_verification",
    variables: ["name", "url"],
    email: {
      fr: {
        subject: "Confirmez votre compte RideKmer",
        body: "Bonjour {{name}}, confirmez votre adresse e-mail : {{url}}",
      },
      en: {
        subject: "Confirm your RideKmer account",
        body: "Hello {{name}}, confirm your email address: {{url}}",
      },
    },
  },
  {
    key: "password_reset",
    variables: ["name", "url"],
    email: {
      fr: {
        subject: "Réinitialisation de votre mot de passe",
        body: "Bonjour {{name}}, réinitialisez votre mot de passe : {{url}}. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.",
      },
      en: {
        subject: "Reset your password",
        body: "Hello {{name}}, reset your password: {{url}}. If you did not request this, ignore this message.",
      },
    },
  },
  {
    key: "admin_credentials",
    variables: ["name", "email", "password", "url"],
    email: {
      fr: {
        subject: "Votre accès administrateur RideKmer",
        body: "Bonjour {{name}}, votre compte super administrateur RideKmer est prêt.\n\nIdentifiant : {{email}}\nMot de passe temporaire : {{password}}\n\nConnectez-vous ici : {{url}}\n\nDès la première connexion : changez ce mot de passe (Compte → Sécurité), puis activez la double authentification (TOTP), obligatoire pour l'espace d'administration. Ne transférez pas ce message ; supprimez-le une fois le mot de passe changé.",
      },
      en: {
        subject: "Your RideKmer administrator access",
        body: "Hello {{name}}, your RideKmer super administrator account is ready.\n\nSign-in: {{email}}\nTemporary password: {{password}}\n\nSign in here: {{url}}\n\nOn first sign-in: change this password (Account → Security), then enable two-factor authentication (TOTP), which is mandatory for the administration area. Do not forward this message; delete it once the password is changed.",
      },
    },
  },
  {
    key: "admin_role_granted",
    variables: ["name", "email", "url"],
    email: {
      fr: {
        subject: "Rôle super administrateur RideKmer attribué",
        body: "Bonjour {{name}}, le rôle super administrateur a été attribué à votre compte RideKmer existant ({{email}}). Connectez-vous avec votre mot de passe habituel : {{url}} puis activez la double authentification (TOTP) sous Compte → Sécurité.",
      },
      en: {
        subject: "RideKmer super administrator role granted",
        body: "Hello {{name}}, the super administrator role was granted to your existing RideKmer account ({{email}}). Sign in with your usual password: {{url}} then enable two-factor authentication (TOTP) under Account → Security.",
      },
    },
  },
  {
    key: "vehicle_submitted",
    variables: ["ownerName", "vehicle"],
    email: {
      fr: {
        subject: "Véhicule soumis pour vérification",
        body: "Bonjour {{ownerName}}, votre véhicule {{vehicle}} a été soumis. Notre équipe le vérifie sous 48 h ouvrées.",
      },
      en: {
        subject: "Vehicle submitted for review",
        body: "Hello {{ownerName}}, your vehicle {{vehicle}} has been submitted. Our team reviews it within 48 working hours.",
      },
    },
    inApp: {
      fr: { title: "Véhicule soumis", body: "{{vehicle}} est en cours de vérification." },
      en: { title: "Vehicle submitted", body: "{{vehicle}} is under review." },
    },
  },
  {
    key: "vehicle_approved",
    variables: ["ownerName", "vehicle"],
    email: {
      fr: {
        subject: "Véhicule approuvé",
        body: "Bonne nouvelle {{ownerName}} : {{vehicle}} est approuvé et visible par les clients.",
      },
      en: {
        subject: "Vehicle approved",
        body: "Good news {{ownerName}}: {{vehicle}} is approved and visible to customers.",
      },
    },
    sms: T(
      "RideKmer : {{vehicle}} est approuvé et désormais visible.",
      "RideKmer: {{vehicle}} is approved and now visible.",
    ),
    inApp: {
      fr: { title: "Véhicule approuvé", body: "{{vehicle}} est en ligne." },
      en: { title: "Vehicle approved", body: "{{vehicle}} is live." },
    },
  },
  {
    key: "document_rejected",
    variables: ["name", "document", "reason"],
    email: {
      fr: {
        subject: "Document refusé",
        body: "Bonjour {{name}}, le document « {{document}} » a été refusé : {{reason}}. Merci d'en soumettre une nouvelle version.",
      },
      en: {
        subject: "Document rejected",
        body: 'Hello {{name}}, the document "{{document}}" was rejected: {{reason}}. Please submit a new version.',
      },
    },
    inApp: {
      fr: { title: "Document refusé", body: "{{document}} : {{reason}}" },
      en: { title: "Document rejected", body: "{{document}}: {{reason}}" },
    },
  },
  {
    key: "document_expiry",
    variables: ["name", "document", "vehicle", "days", "date"],
    email: {
      fr: {
        subject: "Document bientôt expiré",
        body: "Bonjour {{name}}, le document « {{document}} » de {{vehicle}} expire dans {{days}} jour(s) ({{date}}). Un document expiré rend le véhicule indisponible.",
      },
      en: {
        subject: "Document expiring soon",
        body: 'Hello {{name}}, the document "{{document}}" for {{vehicle}} expires in {{days}} day(s) ({{date}}). An expired document makes the vehicle unavailable.',
      },
    },
    sms: T(
      "RideKmer : {{document}} ({{vehicle}}) expire dans {{days}} j.",
      "RideKmer: {{document}} ({{vehicle}}) expires in {{days}} days.",
    ),
    inApp: {
      fr: {
        title: "Document bientôt expiré",
        body: "{{document}} ({{vehicle}}) expire le {{date}}.",
      },
      en: { title: "Document expiring", body: "{{document}} ({{vehicle}}) expires on {{date}}." },
    },
  },
  {
    key: "booking_created",
    variables: ["name", "reference", "vehicle", "start", "end", "total"],
    email: {
      fr: {
        subject: "Réservation {{reference}} créée",
        body: "Bonjour {{name}}, votre réservation {{reference}} pour {{vehicle}} du {{start}} au {{end}} est créée. Montant : {{total}}.",
      },
      en: {
        subject: "Booking {{reference}} created",
        body: "Hello {{name}}, your booking {{reference}} for {{vehicle}} from {{start}} to {{end}} is created. Amount: {{total}}.",
      },
    },
    inApp: {
      fr: { title: "Réservation créée", body: "{{reference}} · {{vehicle}}" },
      en: { title: "Booking created", body: "{{reference}} · {{vehicle}}" },
    },
  },
  {
    key: "payment_pending",
    variables: ["name", "reference", "amount", "method"],
    sms: T(
      "RideKmer : paiement de {{amount}} en attente pour {{reference}} via {{method}}. Validez sur votre téléphone.",
      "RideKmer: payment of {{amount}} pending for {{reference}} via {{method}}. Approve on your phone.",
    ),
    inApp: {
      fr: { title: "Paiement en attente", body: "{{amount}} pour {{reference}}" },
      en: { title: "Payment pending", body: "{{amount}} for {{reference}}" },
    },
  },
  {
    key: "payment_successful",
    variables: ["name", "reference", "amount"],
    email: {
      fr: {
        subject: "Paiement reçu pour {{reference}}",
        body: "Bonjour {{name}}, nous avons reçu {{amount}} pour la réservation {{reference}}. Merci.",
      },
      en: {
        subject: "Payment received for {{reference}}",
        body: "Hello {{name}}, we received {{amount}} for booking {{reference}}. Thank you.",
      },
    },
    sms: T(
      "RideKmer : paiement de {{amount}} reçu pour {{reference}}.",
      "RideKmer: payment of {{amount}} received for {{reference}}.",
    ),
    inApp: {
      fr: { title: "Paiement reçu", body: "{{amount}} · {{reference}}" },
      en: { title: "Payment received", body: "{{amount}} · {{reference}}" },
    },
  },
  {
    key: "booking_confirmed",
    variables: ["name", "reference", "vehicle", "start", "pickup"],
    email: {
      fr: {
        subject: "Réservation {{reference}} confirmée",
        body: "Bonjour {{name}}, {{vehicle}} vous attend le {{start}} ({{pickup}}). Référence : {{reference}}.",
      },
      en: {
        subject: "Booking {{reference}} confirmed",
        body: "Hello {{name}}, {{vehicle}} is ready for you on {{start}} ({{pickup}}). Reference: {{reference}}.",
      },
    },
    sms: T(
      "RideKmer : réservation {{reference}} confirmée pour le {{start}}.",
      "RideKmer: booking {{reference}} confirmed for {{start}}.",
    ),
    inApp: {
      fr: { title: "Réservation confirmée", body: "{{reference}} · {{start}}" },
      en: { title: "Booking confirmed", body: "{{reference}} · {{start}}" },
    },
  },
  {
    key: "upcoming_pickup",
    variables: ["name", "reference", "vehicle", "start", "pickup"],
    sms: T(
      "RideKmer : rappel, prise en charge de {{vehicle}} le {{start}} ({{pickup}}). Réf. {{reference}}.",
      "RideKmer: reminder, pickup of {{vehicle}} on {{start}} ({{pickup}}). Ref. {{reference}}.",
    ),
    inApp: {
      fr: { title: "Prise en charge demain", body: "{{vehicle}} · {{start}}" },
      en: { title: "Pickup tomorrow", body: "{{vehicle}} · {{start}}" },
    },
  },
  {
    key: "return_reminder",
    variables: ["name", "reference", "vehicle", "end"],
    sms: T(
      "RideKmer : rappel, retour de {{vehicle}} prévu le {{end}}. Réf. {{reference}}.",
      "RideKmer: reminder, return of {{vehicle}} due on {{end}}. Ref. {{reference}}.",
    ),
    inApp: {
      fr: { title: "Retour prévu", body: "{{vehicle}} · {{end}}" },
      en: { title: "Return due", body: "{{vehicle}} · {{end}}" },
    },
  },
  {
    key: "late_return",
    variables: ["name", "reference", "vehicle", "end", "lateFee"],
    sms: T(
      "RideKmer : le retour de {{vehicle}} était prévu le {{end}}. Des frais de retard ({{lateFee}}/jour) s'appliquent. Contactez-nous.",
      "RideKmer: {{vehicle}} was due back on {{end}}. Late fees ({{lateFee}}/day) apply. Please contact us.",
    ),
    inApp: {
      fr: { title: "Retour en retard", body: "{{vehicle}} était attendu le {{end}}." },
      en: { title: "Late return", body: "{{vehicle}} was due on {{end}}." },
    },
  },
  {
    key: "booking_extension",
    variables: ["name", "reference", "newEnd", "amount", "status"],
    email: {
      fr: {
        subject: "Prolongation de {{reference}} : {{status}}",
        body: "Bonjour {{name}}, votre demande de prolongation jusqu'au {{newEnd}} ({{amount}}) est {{status}}.",
      },
      en: {
        subject: "Extension of {{reference}}: {{status}}",
        body: "Hello {{name}}, your extension request until {{newEnd}} ({{amount}}) is {{status}}.",
      },
    },
    inApp: {
      fr: { title: "Prolongation {{status}}", body: "{{reference}} jusqu'au {{newEnd}}" },
      en: { title: "Extension {{status}}", body: "{{reference}} until {{newEnd}}" },
    },
  },
  {
    key: "booking_cancelled",
    variables: ["name", "reference", "refund"],
    email: {
      fr: {
        subject: "Réservation {{reference}} annulée",
        body: "Bonjour {{name}}, la réservation {{reference}} est annulée. Remboursement prévu : {{refund}}.",
      },
      en: {
        subject: "Booking {{reference}} cancelled",
        body: "Hello {{name}}, booking {{reference}} is cancelled. Expected refund: {{refund}}.",
      },
    },
    inApp: {
      fr: { title: "Réservation annulée", body: "{{reference}}" },
      en: { title: "Booking cancelled", body: "{{reference}}" },
    },
  },
  {
    key: "refund_update",
    variables: ["name", "reference", "amount", "status"],
    email: {
      fr: {
        subject: "Remboursement {{reference}} : {{status}}",
        body: "Bonjour {{name}}, le remboursement de {{amount}} pour {{reference}} est {{status}}.",
      },
      en: {
        subject: "Refund {{reference}}: {{status}}",
        body: "Hello {{name}}, the refund of {{amount}} for {{reference}} is {{status}}.",
      },
    },
    sms: T(
      "RideKmer : remboursement de {{amount}} ({{reference}}) : {{status}}.",
      "RideKmer: refund of {{amount}} ({{reference}}): {{status}}.",
    ),
    inApp: {
      fr: { title: "Remboursement {{status}}", body: "{{amount}} · {{reference}}" },
      en: { title: "Refund {{status}}", body: "{{amount}} · {{reference}}" },
    },
  },
  {
    key: "owner_payout",
    variables: ["ownerName", "amount", "period", "status"],
    email: {
      fr: {
        subject: "Versement propriétaire : {{status}}",
        body: "Bonjour {{ownerName}}, votre versement de {{amount}} pour la période {{period}} est {{status}}.",
      },
      en: {
        subject: "Owner payout: {{status}}",
        body: "Hello {{ownerName}}, your payout of {{amount}} for {{period}} is {{status}}.",
      },
    },
    sms: T(
      "RideKmer : versement de {{amount}} ({{period}}) : {{status}}.",
      "RideKmer: payout of {{amount}} ({{period}}): {{status}}.",
    ),
    inApp: {
      fr: { title: "Versement {{status}}", body: "{{amount}} · {{period}}" },
      en: { title: "Payout {{status}}", body: "{{amount}} · {{period}}" },
    },
  },
  {
    key: "maintenance_update",
    variables: ["name", "vehicle", "title", "status"],
    email: {
      fr: {
        subject: "Maintenance {{vehicle}} : {{status}}",
        body: "Bonjour {{name}}, l'intervention « {{title}} » sur {{vehicle}} est {{status}}.",
      },
      en: {
        subject: "Maintenance {{vehicle}}: {{status}}",
        body: 'Hello {{name}}, the job "{{title}}" on {{vehicle}} is {{status}}.',
      },
    },
    inApp: {
      fr: { title: "Maintenance {{status}}", body: "{{vehicle}} · {{title}}" },
      en: { title: "Maintenance {{status}}", body: "{{vehicle}} · {{title}}" },
    },
  },
  {
    key: "incident_update",
    variables: ["name", "reference", "vehicle", "status"],
    email: {
      fr: {
        subject: "Incident {{reference}} : {{status}}",
        body: "Bonjour {{name}}, l'incident {{reference}} concernant {{vehicle}} est {{status}}.",
      },
      en: {
        subject: "Incident {{reference}}: {{status}}",
        body: "Hello {{name}}, incident {{reference}} concerning {{vehicle}} is {{status}}.",
      },
    },
    inApp: {
      fr: { title: "Incident {{status}}", body: "{{reference}} · {{vehicle}}" },
      en: { title: "Incident {{status}}", body: "{{reference}} · {{vehicle}}" },
    },
  },
];

export function renderTemplate(
  template: string,
  variables: Record<string, string | number>,
): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => {
    const value = variables[key];
    return value === undefined ? "" : String(value);
  });
}

export function findTemplate(key: string): TemplateDefinition | undefined {
  return NOTIFICATION_TEMPLATES.find((t) => t.key === key);
}
