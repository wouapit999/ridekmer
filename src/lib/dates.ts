import { TZDate } from "@date-fns/tz";
import { differenceInMinutes, format, isAfter, isBefore, startOfDay } from "date-fns";

export const APP_TIMEZONE = "Africa/Douala";
const MINUTES_PER_DAY = 24 * 60;

/** Interpret a wall-clock date/time string ("2026-10-20T09:00") in Africa/Douala. */
export function fromDoualaLocal(isoLocal: string): Date {
  const [datePart, timePart = "00:00"] = isoLocal.split("T");
  const [y, m, d] = (datePart ?? "").split("-").map(Number);
  const [hh = 0, mm = 0] = timePart.split(":").map(Number);
  if (!y || !m || !d) throw new Error(`Invalid local date: ${isoLocal}`);
  return new Date(new TZDate(y, m - 1, d, hh, mm, 0, APP_TIMEZONE).getTime());
}

export function toDouala(date: Date): TZDate {
  return new TZDate(date, APP_TIMEZONE);
}

/**
 * Number of rental days between two instants, computed in Africa/Douala.
 * Any started day counts as a full day (minimum 1).
 */
export function rentalDaysBetween(startAt: Date, endAt: Date): number {
  if (!isAfter(endAt, startAt)) {
    throw new RangeError("endAt must be after startAt");
  }
  const minutes = differenceInMinutes(toDouala(endAt), toDouala(startAt));
  return Math.max(1, Math.ceil(minutes / MINUTES_PER_DAY));
}

export function startOfDoualaDay(date: Date): Date {
  return new Date(startOfDay(toDouala(date)).getTime());
}

export function formatDoualaDateTime(date: Date, locale: "fr" | "en" = "fr"): string {
  return new Intl.DateTimeFormat(locale === "fr" ? "fr-CM" : "en-CM", {
    timeZone: APP_TIMEZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatIsoDate(date: Date): string {
  return format(toDouala(date), "yyyy-MM-dd");
}

export function isWithinRange(date: Date, start: Date, end: Date): boolean {
  return !isBefore(date, start) && isBefore(date, end);
}
