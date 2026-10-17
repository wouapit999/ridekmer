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
  /** Offer MTN/Orange as a hand-made transfer to the company number while the API is not live. */
  manualMobileMoneyEnabled: boolean;
  manualMobileMoney: {
    mtnNumber: string;
    orangeNumber: string;
    accountName: string;
    /** WhatsApp number the customer sends the transaction ID to. */
    whatsappNumber: string;
    expiryHours: number;
  };
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
  manualMobileMoneyEnabled: true,
  manualMobileMoney: {
    mtnNumber: "+237677550803",
    orangeNumber: "+237699949027",
    accountName: "WOUAPIT MBAIMOUN NJI ROLAND",
    whatsappNumber: "+258878275656",
    expiryHours: 24,
  },
};

const KEYS = [
  "payment.bank_transfer_enabled",
  "payment.cash_enabled",
  "payment.bank_transfer_instructions_fr",
  "payment.bank_transfer_instructions_en",
  "payment.mobile_money_expiry_minutes",
  "payment.bank_transfer_expiry_hours",
  "finance.dual_approval_threshold_xaf",
  "payment.manual_mobile_money_enabled",
  "payment.manual_mtn_momo_number",
  "payment.manual_orange_money_number",
  "payment.manual_mobile_money_account_name",
  "payment.manual_whatsapp_number",
  "payment.manual_mobile_money_expiry_hours",
];

function int(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return raw !== undefined && Number.isInteger(n) && n >= 0 ? n : fallback;
}

function text(raw: string | undefined, fallback: string): string {
  return raw?.trim() ? raw.trim() : fallback;
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
    manualMobileMoneyEnabled: (v.get("payment.manual_mobile_money_enabled") ?? "true") === "true",
    manualMobileMoney: {
      mtnNumber: text(
        v.get("payment.manual_mtn_momo_number"),
        DEFAULTS.manualMobileMoney.mtnNumber,
      ),
      orangeNumber: text(
        v.get("payment.manual_orange_money_number"),
        DEFAULTS.manualMobileMoney.orangeNumber,
      ),
      accountName: text(
        v.get("payment.manual_mobile_money_account_name"),
        DEFAULTS.manualMobileMoney.accountName,
      ),
      whatsappNumber: text(
        v.get("payment.manual_whatsapp_number"),
        DEFAULTS.manualMobileMoney.whatsappNumber,
      ),
      expiryHours: int(
        v.get("payment.manual_mobile_money_expiry_hours"),
        DEFAULTS.manualMobileMoney.expiryHours,
      ),
    },
  };
});
