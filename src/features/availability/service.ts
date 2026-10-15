import { addDays, addMinutes } from "date-fns";

import {
  formatIsoDate,
  fromDoualaLocal,
  rentalDaysBetween,
  startOfDoualaDay,
  toDouala,
} from "@/lib/dates";
import { db } from "@/server/db";

import type { Prisma } from "@/generated/prisma/client";

export const BLOCKING_BOOKING_STATUSES = [
  "PENDING_VERIFICATION",
  "PAYMENT_PENDING",
  "CONFIRMED",
  "READY_FOR_PICKUP",
  "ACTIVE",
  "EXTENSION_REQUESTED",
] as const;

export interface Window {
  startAt: Date;
  endAt: Date;
}

export class AvailabilityError extends Error {
  constructor(
    public readonly code:
      | "INVALID_RANGE"
      | "TOO_SOON"
      | "TOO_SHORT"
      | "TOO_LONG"
      | "UNAVAILABLE"
      | "VEHICLE_NOT_BOOKABLE",
  ) {
    super(code);
    this.name = "AvailabilityError";
  }
}

/** Build the rental window from local Douala date/time strings. */
export function windowFromLocal(
  pickupDate: string,
  pickupTime: string,
  returnDate: string,
  returnTime: string,
): Window {
  const startAt = fromDoualaLocal(`${pickupDate}T${pickupTime}`);
  const endAt = fromDoualaLocal(`${returnDate}T${returnTime}`);
  if (!(endAt > startAt)) throw new AvailabilityError("INVALID_RANGE");
  return { startAt, endAt };
}

/** Calendar days (yyyy-mm-dd, Douala) covered by a window; each started day counts. */
export function rentalCalendarDays(window: Window): string[] {
  const count = rentalDaysBetween(window.startAt, window.endAt);
  const first = startOfDoualaDay(window.startAt);
  return Array.from({ length: count }, (_, i) => formatIsoDate(addDays(first, i)));
}

export function validateWindowRules(
  window: Window,
  rules: { minAdvanceHours: number; minRentalDays: number; maxRentalDays: number | null },
  now = new Date(),
) {
  const minStart = addMinutes(now, rules.minAdvanceHours * 60);
  if (window.startAt < minStart) throw new AvailabilityError("TOO_SOON");
  const days = rentalDaysBetween(window.startAt, window.endAt);
  if (days < rules.minRentalDays) throw new AvailabilityError("TOO_SHORT");
  if (rules.maxRentalDays && days > rules.maxRentalDays) throw new AvailabilityError("TOO_LONG");
  return days;
}

/**
 * Database check used inside the booking transaction: any blocking booking, availability block
 * or foreign active hold overlapping the window makes the vehicle unavailable.
 */
export async function isWindowFree(
  client: Prisma.TransactionClient | typeof db,
  vehicleId: string,
  window: Window,
  options: {
    ignoreHoldId?: string;
    ignoreBookingId?: string;
    ignoreHoldsOfUserId?: string | null;
    now?: Date;
  } = {},
): Promise<boolean> {
  const now = options.now ?? new Date();
  const overlap = { startAt: { lt: window.endAt }, endAt: { gt: window.startAt } };
  const [bookings, blocks, holds] = await Promise.all([
    client.booking.count({
      where: {
        vehicleId,
        status: { in: [...BLOCKING_BOOKING_STATUSES] },
        ...overlap,
        ...(options.ignoreBookingId ? { id: { not: options.ignoreBookingId } } : {}),
      },
    }),
    client.vehicleAvailability.count({ where: { vehicleId, ...overlap } }),
    client.reservationHold.count({
      where: {
        vehicleId,
        status: "ACTIVE",
        expiresAt: { gt: now },
        ...overlap,
        ...(options.ignoreHoldId ? { id: { not: options.ignoreHoldId } } : {}),
        ...(options.ignoreHoldsOfUserId ? { NOT: { userId: options.ignoreHoldsOfUserId } } : {}),
      },
    }),
  ]);
  return bookings === 0 && blocks === 0 && holds === 0;
}

/** Ranges unavailable for the public calendar (next `horizonDays`). Holds are not exposed. */
export async function unavailableRanges(vehicleId: string, horizonDays = 120, now = new Date()) {
  const from = startOfDoualaDay(now);
  const to = addDays(from, horizonDays);
  const [bookings, blocks] = await Promise.all([
    db.booking.findMany({
      where: {
        vehicleId,
        status: { in: [...BLOCKING_BOOKING_STATUSES] },
        startAt: { lt: to },
        endAt: { gt: from },
      },
      select: { startAt: true, endAt: true },
    }),
    db.vehicleAvailability.findMany({
      where: { vehicleId, startAt: { lt: to }, endAt: { gt: from } },
      select: { startAt: true, endAt: true },
    }),
  ]);
  return [...bookings, ...blocks]
    .map((r) => ({
      from: formatIsoDate(r.startAt),
      to: formatIsoDate(new Date(r.endAt.getTime() - 1)),
    }))
    .sort((a, b) => a.from.localeCompare(b.from));
}

export function hoursUntil(date: Date, now = new Date()): number {
  return (date.getTime() - now.getTime()) / 3_600_000;
}

export function localDateTimeParts(date: Date): { date: string; time: string } {
  const d = toDouala(date);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}
