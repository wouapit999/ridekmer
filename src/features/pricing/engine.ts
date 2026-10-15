/**
 * Deterministic pricing engine. Pure: no I/O, integer XAF only, basis points for rates.
 * Every intermediate amount is rounded half-up through `applyBps`, so the same input always
 * yields the same breakdown (the breakdown is persisted as an immutable BookingPriceSnapshot).
 */
import { applyBps, type Xaf } from "@/lib/money";

export const PRICING_VERSION = "2026.10-m3";

export interface DayRule {
  /** Multiplier applied to the daily rate for days matching the rule (10000 = ×1). */
  percentBps: number;
  /** ISO dates (yyyy-mm-dd, Douala) the rule covers; empty = weekend rule. */
  dates?: Set<string>;
  weekend?: boolean;
  name: string;
}

export interface LongDurationRule {
  minDays: number;
  /** Discount on base rental in basis points. */
  percentBps: number;
  name: string;
}

export interface PromoInput {
  code: string;
  discountType: "PERCENTAGE" | "FIXED_AMOUNT";
  percentBps?: number | null;
  amountXaf?: number | null;
  maxDiscountXaf?: number | null;
  minBookingXaf?: number | null;
}

export interface QuoteInput {
  /** Calendar days of the rental (each day as yyyy-mm-dd in Africa/Douala). */
  days: string[];
  dailyRateXaf: Xaf;
  weeklyRateXaf?: Xaf | null;
  monthlyRateXaf?: Xaf | null;
  securityDepositXaf: Xaf;
  dailyKmAllowance?: number | null;
  extraKmRateXaf?: Xaf | null;
  chauffeur: boolean;
  chauffeurDailyFeeXaf?: Xaf | null;
  delivery: boolean;
  deliveryFeeXaf: Xaf;
  returnPickup: boolean;
  returnPickupFeeXaf: Xaf;
  additionalDrivers: number;
  additionalDriverFeeXafPerDay: Xaf;
  addOns: Array<{ key: string; unitPriceXaf: Xaf; quantity: number }>;
  serviceFeeBps: number;
  taxBps: number;
  commissionBps: number;
  dayRules?: DayRule[];
  longDurationRules?: LongDurationRule[];
  promo?: PromoInput | null;
}

export interface QuoteLine {
  key: string;
  amountXaf: Xaf;
  detail?: string;
}

export interface Quote {
  rentalDays: number;
  dailyRateXaf: Xaf;
  baseRentalXaf: Xaf;
  deliveryFeeXaf: Xaf;
  returnPickupFeeXaf: Xaf;
  chauffeurFeeXaf: Xaf;
  additionalDriverXaf: Xaf;
  addOnsXaf: Xaf;
  serviceFeeXaf: Xaf;
  discountXaf: Xaf;
  taxXaf: Xaf;
  totalRentalXaf: Xaf;
  securityDepositXaf: Xaf;
  grandTotalXaf: Xaf;
  kmAllowance: number | null;
  extraKmRateXaf: Xaf | null;
  commissionBps: number;
  commissionXaf: Xaf;
  ownerShareXaf: Xaf;
  lines: QuoteLine[];
  promoApplied: string | null;
  promoRejectedReason: "MIN_BOOKING" | null;
  pricingVersion: string;
}

const WEEKEND_DAYS = new Set([0, 6]);

function isWeekend(isoDate: string): boolean {
  const d = new Date(`${isoDate}T12:00:00Z`);
  return WEEKEND_DAYS.has(d.getUTCDay());
}

/** Per-day pricing with seasonal / weekend multipliers. */
export function dailyPathPrice(
  days: string[],
  dailyRate: Xaf,
  rules: DayRule[] = [],
): { total: Xaf; applied: string[] } {
  let total = 0;
  const applied = new Set<string>();
  for (const day of days) {
    let price = dailyRate;
    for (const rule of rules) {
      const matches = rule.weekend ? isWeekend(day) : rule.dates?.has(day);
      if (matches) {
        price = applyBps(price, rule.percentBps);
        applied.add(rule.name);
      }
    }
    total += price;
  }
  return { total, applied: [...applied] };
}

/** Package pricing using monthly (28-day) and weekly (7-day) rates, never more than daily × days. */
export function packagePathPrice(
  days: number,
  dailyRate: Xaf,
  weeklyRate?: Xaf | null,
  monthlyRate?: Xaf | null,
): Xaf {
  let remaining = days;
  let total = 0;
  if (monthlyRate && remaining >= 28) {
    const months = Math.floor(remaining / 28);
    total += months * monthlyRate;
    remaining -= months * 28;
  }
  if (weeklyRate && remaining >= 7) {
    const weeks = Math.floor(remaining / 7);
    total += weeks * weeklyRate;
    remaining -= weeks * 7;
  }
  total += remaining * dailyRate;
  // A package can never cost more than paying each day at the daily rate.
  return Math.min(total, days * dailyRate);
}

export function computeQuote(input: QuoteInput): Quote {
  const rentalDays = input.days.length;
  if (rentalDays < 1) throw new RangeError("A quote needs at least one rental day");
  const lines: QuoteLine[] = [];

  const daily = dailyPathPrice(input.days, input.dailyRateXaf, input.dayRules);
  const pkg = packagePathPrice(
    rentalDays,
    input.dailyRateXaf,
    input.weeklyRateXaf,
    input.monthlyRateXaf,
  );
  const baseRentalXaf = Math.min(daily.total, pkg);
  lines.push({
    key: "base",
    amountXaf: baseRentalXaf,
    detail:
      daily.total <= pkg
        ? daily.applied.length
          ? `daily:${daily.applied.join("+")}`
          : "daily"
        : "package",
  });

  let discountXaf = 0;
  const longRule = [...(input.longDurationRules ?? [])]
    .filter((r) => rentalDays >= r.minDays)
    .sort((a, b) => b.minDays - a.minDays)[0];
  if (longRule) {
    const d = applyBps(baseRentalXaf, longRule.percentBps);
    discountXaf += d;
    lines.push({ key: "long_duration_discount", amountXaf: -d, detail: longRule.name });
  }

  const chauffeurFeeXaf = input.chauffeur ? (input.chauffeurDailyFeeXaf ?? 0) * rentalDays : 0;
  if (chauffeurFeeXaf) lines.push({ key: "chauffeur", amountXaf: chauffeurFeeXaf });
  const deliveryFeeXaf = input.delivery ? input.deliveryFeeXaf : 0;
  if (deliveryFeeXaf) lines.push({ key: "delivery", amountXaf: deliveryFeeXaf });
  const returnPickupFeeXaf = input.returnPickup ? input.returnPickupFeeXaf : 0;
  if (returnPickupFeeXaf) lines.push({ key: "return_pickup", amountXaf: returnPickupFeeXaf });
  const additionalDriverXaf =
    Math.max(0, input.additionalDrivers) * input.additionalDriverFeeXafPerDay * rentalDays;
  if (additionalDriverXaf) lines.push({ key: "additional_driver", amountXaf: additionalDriverXaf });
  const addOnsXaf = input.addOns.reduce(
    (sum, a) => sum + a.unitPriceXaf * Math.max(0, a.quantity),
    0,
  );
  for (const a of input.addOns)
    if (a.quantity > 0)
      lines.push({ key: `addon:${a.key}`, amountXaf: a.unitPriceXaf * a.quantity });

  const subtotalBeforePromo =
    baseRentalXaf -
    discountXaf +
    chauffeurFeeXaf +
    deliveryFeeXaf +
    returnPickupFeeXaf +
    additionalDriverXaf +
    addOnsXaf;

  let promoApplied: string | null = null;
  let promoRejectedReason: Quote["promoRejectedReason"] = null;
  let promoDiscount = 0;
  if (input.promo) {
    if (input.promo.minBookingXaf && subtotalBeforePromo < input.promo.minBookingXaf) {
      promoRejectedReason = "MIN_BOOKING";
    } else {
      const promoBase = baseRentalXaf - discountXaf + chauffeurFeeXaf;
      promoDiscount =
        input.promo.discountType === "PERCENTAGE"
          ? applyBps(promoBase, input.promo.percentBps ?? 0)
          : (input.promo.amountXaf ?? 0);
      if (input.promo.maxDiscountXaf)
        promoDiscount = Math.min(promoDiscount, input.promo.maxDiscountXaf);
      promoDiscount = Math.max(0, Math.min(promoDiscount, promoBase));
      if (promoDiscount > 0) {
        discountXaf += promoDiscount;
        promoApplied = input.promo.code;
        lines.push({ key: "promo", amountXaf: -promoDiscount, detail: input.promo.code });
      }
    }
  }

  const subtotal = subtotalBeforePromo - promoDiscount;
  const serviceFeeXaf = applyBps(subtotal, input.serviceFeeBps);
  if (serviceFeeXaf) lines.push({ key: "service_fee", amountXaf: serviceFeeXaf });
  const taxXaf = applyBps(subtotal + serviceFeeXaf, input.taxBps);
  if (taxXaf) lines.push({ key: "tax", amountXaf: taxXaf });
  const totalRentalXaf = subtotal + serviceFeeXaf + taxXaf;

  const commissionable = baseRentalXaf - discountXaf + chauffeurFeeXaf;
  const commissionXaf = applyBps(Math.max(0, commissionable), input.commissionBps);
  const ownerShareXaf = Math.max(0, commissionable) - commissionXaf;

  return {
    rentalDays,
    dailyRateXaf: input.dailyRateXaf,
    baseRentalXaf,
    deliveryFeeXaf,
    returnPickupFeeXaf,
    chauffeurFeeXaf,
    additionalDriverXaf,
    addOnsXaf,
    serviceFeeXaf,
    discountXaf,
    taxXaf,
    totalRentalXaf,
    securityDepositXaf: input.securityDepositXaf,
    grandTotalXaf: totalRentalXaf + input.securityDepositXaf,
    kmAllowance: input.dailyKmAllowance ?? null,
    extraKmRateXaf: input.extraKmRateXaf ?? null,
    commissionBps: input.commissionBps,
    commissionXaf,
    ownerShareXaf,
    lines,
    promoApplied,
    promoRejectedReason,
    pricingVersion: PRICING_VERSION,
  };
}

/** Cancellation fee according to the free window and late-fee percentage. */
export function computeCancellationFee(input: {
  totalRentalXaf: Xaf;
  hoursBeforePickup: number;
  freeHours: number;
  lateFeeBps: number;
  noShow?: boolean;
}): Xaf {
  if (input.noShow) return input.totalRentalXaf;
  if (input.hoursBeforePickup >= input.freeHours) return 0;
  return applyBps(input.totalRentalXaf, input.lateFeeBps);
}

/** Late-return fee: one unit per started day beyond the agreed end. */
export function computeLateReturnFee(input: {
  minutesLate: number;
  feePerDayXaf: Xaf;
  graceMinutes?: number;
}): Xaf {
  const grace = input.graceMinutes ?? 60;
  if (input.minutesLate <= grace) return 0;
  return Math.ceil((input.minutesLate - grace) / (24 * 60)) * input.feePerDayXaf;
}
