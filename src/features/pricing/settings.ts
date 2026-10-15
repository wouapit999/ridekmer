import { cache } from "react";

import { db } from "@/server/db";

export interface PricingSettings {
  serviceFeeBps: number;
  taxBps: number;
  commissionManagedBps: number;
  commissionSelfManagedBps: number;
  deliveryFeeXaf: number;
  returnPickupFeeXaf: number;
  additionalDriverFeeXafPerDay: number;
  lateReturnFeeXafPerDay: number;
  cleaningFeeXaf: number;
  holdMinutes: number;
  paymentTimeoutMinutes: number;
  verificationTimeoutHours: number;
  minAdvanceHours: number;
  cancellationFreeHours: number;
  cancellationLateFeeBps: number;
}

export const DEFAULT_PRICING_SETTINGS: PricingSettings = {
  serviceFeeBps: 500,
  taxBps: 0,
  commissionManagedBps: 2000,
  commissionSelfManagedBps: 1500,
  deliveryFeeXaf: 5000,
  returnPickupFeeXaf: 5000,
  additionalDriverFeeXafPerDay: 5000,
  lateReturnFeeXafPerDay: 25000,
  cleaningFeeXaf: 10000,
  holdMinutes: 15,
  paymentTimeoutMinutes: 30,
  verificationTimeoutHours: 48,
  minAdvanceHours: 4,
  cancellationFreeHours: 48,
  cancellationLateFeeBps: 3000,
};

const KEYS: Record<keyof PricingSettings, string> = {
  serviceFeeBps: "pricing.service_fee_bps",
  taxBps: "pricing.tax_bps",
  commissionManagedBps: "commission.managed_bps",
  commissionSelfManagedBps: "commission.self_managed_bps",
  deliveryFeeXaf: "pricing.delivery_fee_xaf",
  returnPickupFeeXaf: "pricing.return_pickup_fee_xaf",
  additionalDriverFeeXafPerDay: "pricing.additional_driver_fee_xaf_per_day",
  lateReturnFeeXafPerDay: "pricing.late_return_fee_xaf_per_day",
  cleaningFeeXaf: "pricing.cleaning_fee_xaf",
  holdMinutes: "booking.hold_minutes",
  paymentTimeoutMinutes: "booking.payment_timeout_minutes",
  verificationTimeoutHours: "booking.verification_timeout_hours",
  minAdvanceHours: "booking.min_advance_hours",
  cancellationFreeHours: "cancellation.free_hours_before_pickup",
  cancellationLateFeeBps: "cancellation.late_fee_bps",
};

/** Load pricing/booking settings from SystemSetting with safe defaults (request-cached). */
export const getPricingSettings = cache(async (): Promise<PricingSettings> => {
  const rows = await db.systemSetting.findMany({ where: { key: { in: Object.values(KEYS) } } });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const out = { ...DEFAULT_PRICING_SETTINGS };
  for (const [field, key] of Object.entries(KEYS) as Array<[keyof PricingSettings, string]>) {
    const raw = byKey.get(key);
    if (raw === undefined) continue;
    const n = Number(raw);
    if (Number.isInteger(n) && n >= 0) out[field] = n;
  }
  return out;
});

export function commissionBpsFor(
  model: "RIDEKMER_OWNED" | "FULLY_MANAGED_OWNER_VEHICLE" | "SELF_MANAGED_MARKETPLACE_VEHICLE",
  settings: PricingSettings,
): number {
  if (model === "RIDEKMER_OWNED") return 10_000;
  if (model === "FULLY_MANAGED_OWNER_VEHICLE") return settings.commissionManagedBps;
  return settings.commissionSelfManagedBps;
}
