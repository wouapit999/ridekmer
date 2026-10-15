import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

export const DEFAULT_COUNTRY: CountryCode = "CM";

export interface ParsedPhone {
  e164: string;
  country: CountryCode | undefined;
  isCameroon: boolean;
  national: string;
}

/**
 * Normalise a phone number to E.164. Cameroon numbers are accepted with or without the
 * country code; other countries must include a leading "+".
 */
export function parsePhone(input: string, allowInternational = true): ParsedPhone | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const parsed = parsePhoneNumberFromString(trimmed, DEFAULT_COUNTRY);
  if (!parsed || !parsed.isValid()) return null;
  const isCameroon = parsed.country === "CM";
  if (!isCameroon && !allowInternational) return null;
  return {
    e164: parsed.number,
    country: parsed.country,
    isCameroon,
    national: parsed.formatNational(),
  };
}

export function isValidCameroonMobile(input: string): boolean {
  const parsed = parsePhone(input, false);
  return parsed !== null && parsed.isCameroon;
}

/** Mask all but the last three digits for display and logs. */
export function maskPhoneForDisplay(e164: string): string {
  const digits = e164.replace(/\D/g, "");
  if (digits.length <= 3) return "***";
  return `+${digits.slice(0, 3)} *** ${digits.slice(-3)}`;
}
