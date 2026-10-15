import { addHours } from "date-fns";

import { getPricingSettings } from "@/features/pricing/settings";
import { formatIsoDate } from "@/lib/dates";
import { logger } from "@/lib/logger";
import { formatXaf } from "@/lib/money";
import { db } from "@/server/db";
import { sendTemplatedNotification } from "@/server/notifications";

const customerSelect = {
  id: true,
  name: true,
  email: true,
  phoneNumber: true,
  preferredLocale: true,
} as const;

/** Reminder templates are SMS/in-app: text the customer when a number exists, else in-app. */
function route(customer: { phoneNumber: string | null; email: string }) {
  return customer.phoneNumber
    ? { channel: "SMS" as const, to: customer.phoneNumber }
    : { channel: "IN_APP" as const, to: customer.email };
}

/**
 * Hourly operations job: pickup reminders (24 h before), return reminders (24 h before) and
 * late-return detection for active bookings. Dedupe keys make every notification one-shot.
 */
export async function sendBookingReminders(now = new Date()) {
  const settings = await getPricingSettings();
  const horizon = addHours(now, 24);
  const [pickups, returns, late] = await Promise.all([
    db.booking.findMany({
      where: {
        status: { in: ["CONFIRMED", "READY_FOR_PICKUP"] },
        startAt: { gt: now, lte: horizon },
      },
      include: {
        customer: { select: customerSelect },
        vehicle: { select: { make: true, model: true } },
        pickupBranch: { select: { nameFr: true, nameEn: true } },
      },
    }),
    db.booking.findMany({
      where: {
        status: { in: ["ACTIVE", "EXTENSION_REQUESTED"] },
        endAt: { gt: now, lte: horizon },
      },
      include: {
        customer: { select: customerSelect },
        vehicle: { select: { make: true, model: true } },
      },
    }),
    db.booking.findMany({
      where: {
        status: { in: ["ACTIVE", "EXTENSION_REQUESTED"] },
        endAt: { lt: addHours(now, -1) },
      },
      include: {
        customer: { select: customerSelect },
        vehicle: { select: { make: true, model: true } },
      },
    }),
  ]);
  for (const b of pickups) {
    const locale = b.customer.preferredLocale === "en" ? "en" : "fr";
    await sendTemplatedNotification({
      templateKey: "upcoming_pickup",
      ...route(b.customer),
      locale,
      userId: b.customer.id,
      variables: {
        name: b.customer.name,
        reference: b.reference,
        vehicle: `${b.vehicle.make} ${b.vehicle.model}`,
        start: formatIsoDate(b.startAt),
        pickup:
          b.pickupMode === "DELIVERY"
            ? (b.pickupAddress ?? "")
            : ((locale === "en" ? b.pickupBranch?.nameEn : b.pickupBranch?.nameFr) ?? ""),
      },
      entityType: "Booking",
      entityId: b.id,
      dedupeKey: `upcoming_pickup:${b.id}`,
    });
  }
  for (const b of returns) {
    const locale = b.customer.preferredLocale === "en" ? "en" : "fr";
    await sendTemplatedNotification({
      templateKey: "return_reminder",
      ...route(b.customer),
      locale,
      userId: b.customer.id,
      variables: {
        name: b.customer.name,
        reference: b.reference,
        vehicle: `${b.vehicle.make} ${b.vehicle.model}`,
        end: formatIsoDate(b.endAt),
      },
      entityType: "Booking",
      entityId: b.id,
      dedupeKey: `return_reminder:${b.id}`,
    });
  }
  for (const b of late) {
    const locale = b.customer.preferredLocale === "en" ? "en" : "fr";
    await sendTemplatedNotification({
      templateKey: "late_return",
      ...route(b.customer),
      locale,
      userId: b.customer.id,
      variables: {
        name: b.customer.name,
        reference: b.reference,
        vehicle: `${b.vehicle.make} ${b.vehicle.model}`,
        end: formatIsoDate(b.endAt),
        lateFee: formatXaf(settings.lateReturnFeeXafPerDay, locale),
      },
      entityType: "Booking",
      entityId: b.id,
      dedupeKey: `late_return:${b.id}:${formatIsoDate(now)}`,
    });
  }
  logger.info("cron.booking_reminders", {
    pickups: pickups.length,
    returns: returns.length,
    late: late.length,
  });
  return { pickups: pickups.length, returns: returns.length, late: late.length };
}
