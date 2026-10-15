/**
 * Money helpers. XAF has no minor unit, so every amount is an integer number of francs.
 * Percentages are expressed in basis points (bps): 10 000 bps = 100 %.
 */
export const CURRENCY = "XAF" as const;
export const BPS_DENOMINATOR = 10_000;

export type Xaf = number;

export function assertXaf(value: unknown, label = "amount"): asserts value is Xaf {
  if (typeof value !== "number" || !Number.isInteger(value) || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be an integer number of XAF, received ${String(value)}`);
  }
}

export function addXaf(...amounts: Xaf[]): Xaf {
  return amounts.reduce((sum, a) => {
    assertXaf(a);
    return sum + a;
  }, 0);
}

/** Apply a basis-point percentage with half-up rounding (deterministic, integer only). */
export function applyBps(amount: Xaf, bps: number): Xaf {
  assertXaf(amount, "amount");
  if (!Number.isInteger(bps)) throw new TypeError("bps must be an integer");
  const numerator = amount * bps;
  const sign = numerator < 0 ? -1 : 1;
  const abs = Math.abs(numerator);
  return sign * Math.floor((abs + BPS_DENOMINATOR / 2) / BPS_DENOMINATOR);
}

export function percentToBps(percent: number): number {
  return Math.round(percent * 100);
}

export function formatXaf(amount: Xaf, locale: string = "fr"): string {
  assertXaf(amount);
  const intlLocale = locale === "en" ? "en-CM" : "fr-CM";
  const formatted = new Intl.NumberFormat(intlLocale, {
    style: "currency",
    currency: CURRENCY,
    currencyDisplay: "code",
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(amount);
  // Normalise non-breaking spaces so output is stable across runtimes.
  return formatted.replace(/ | /g, " ").trim();
}

export function clampXaf(amount: Xaf, min: Xaf, max: Xaf): Xaf {
  return Math.min(Math.max(amount, min), max);
}
