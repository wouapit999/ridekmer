import { cache } from "react";

import { getEnv } from "@/lib/env";
import { db } from "@/server/db";

export interface PaymentSettings {
  bankTransferEnabled: boolean;
  cashEnabled: boolean;
  bankTransferInstructions: { fr: string; en: string };
  mobileMoneyExpiryMinutes: number;
  bankTransferExpiryHours: number;
  dualApprovalThresholdXaf: number;
}

const DEFAULTS: PaymentSettings = {
  bankTransferEnabled: true,
  cashEnabled: true,
  bankTransferInstructions: {
    fr: "Coordonnées bancaires à confirmer par la direction.",
    en: "Bank details to be confirmed by management.",
  },
  mobileMoneyExpiryMinutes: 15,
  bankTransferExpiryHours: 24,
  dualApprovalThresholdXaf: 200_000,
};

const KEYS = [
  "payment.bank_transfer_enabled",
  "payment.cash_enabled",
  "payment.bank_transfer_instructions_fr",
  "payment.bank_transfer_instructions_en",
  "payment.mobile_money_expiry_minutes",
  "payment.bank_transfer_expiry_hours",
  "finance.dual_approval_threshold_xaf",
];

function int(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return raw !== undefined && Number.isInteger(n) && n >= 0 ? n : fallback;
}

/** Payment settings from SystemSetting with safe defaults (request-cached). */
export const getPaymentSettings = cache(async (): Promise<PaymentSettings> => {
  const rows = await db.systemSetting.findMany({ where: { key: { in: KEYS } } });
  const v = new Map(rows.map((r) => [r.key, r.value]));
  const env = getEnv();
  return {
    bankTransferEnabled: (v.get("payment.bank_transfer_enabled") ?? "true") === "true",
    cashEnabled: (v.get("payment.cash_enabled") ?? "true") === "true",
    bankTransferInstructions: {
      fr: v.get("payment.bank_transfer_instructions_fr") ?? DEFAULTS.bankTransferInstructions.fr,
      en: v.get("payment.bank_transfer_instructions_en") ?? DEFAULTS.bankTransferInstructions.en,
    },
    mobileMoneyExpiryMinutes: int(
      v.get("payment.mobile_money_expiry_minutes"),
      DEFAULTS.mobileMoneyExpiryMinutes,
    ),
    bankTransferExpiryHours: int(
      v.get("payment.bank_transfer_expiry_hours"),
      DEFAULTS.bankTransferExpiryHours,
    ),
    dualApprovalThresholdXaf: int(
      v.get("finance.dual_approval_threshold_xaf"),
      env.PAYMENT_DUAL_APPROVAL_THRESHOLD_XAF,
    ),
  };
});
