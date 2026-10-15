import { addDays, addMinutes } from "date-fns";

import {
  AvailabilityError,
  BLOCKING_BOOKING_STATUSES,
  hoursUntil,
  isWindowFree,
  rentalCalendarDays,
  validateWindowRules,
  type Window,
} from "@/features/availability/service";
import {
  computeCancellationFee,
  computeQuote,
  type DayRule,
  type LongDurationRule,
  type Quote,
} from "@/features/pricing/engine";
import {
  commissionBpsFor,
  getPricingSettings,
  type PricingSettings,
} from "@/features/pricing/settings";
import { formatIsoDate, rentalDaysBetween } from "@/lib/dates";
import { humanReference } from "@/lib/ids";
import { logger } from "@/lib/logger";
import { formatXaf } from "@/lib/money";
import { recordAudit } from "@/server/audit";
import { db } from "@/server/db";
import { sendTemplatedNotification } from "@/server/notifications";

import type { Prisma } from "@/generated/prisma/client";
import type { ActorType, BookingStatus } from "@/generated/prisma/enums";

import { CUSTOMER_CANCELLABLE, assertTransition, BookingTransitionError } from "./state-machine";

export class BookingError extends Error {
  constructor(
    public readonly code:
      | "VEHICLE_NOT_FOUND"
      | "VEHICLE_NOT_BOOKABLE"
      | "UNAVAILABLE"
      | "HOLD_EXPIRED"
      | "NOT_FOUND"
      | "FORBIDDEN"
      | "INVALID_STATUS"
      | "DRIVE_OPTION"
      | "PROMO_INVALID"
      | "EXTENSION_INVALID"
      | "CUSTOMER_SUSPENDED",
    message?: string,
  ) {
    super(message ?? code);
    this.name = "BookingError";
  }
}

export interface BookingOptions {
  chauffeur: boolean;
  delivery: boolean;
  returnPickup: boolean;
  additionalDrivers: number;
  promoCode?: string | null;
  pickupAddress?: string | null;
  returnAddress?: string | null;
  customerNotes?: string | null;
}

const bookableVehicleWhere = {
  status: "ACTIVE" as const,
  documentsValid: true,
  deletedAt: null,
  publishedAt: { not: null },
};

export async function getBookableVehicle(vehicleId: string) {
  return db.vehicle.findFirst({
    where: { id: vehicleId, ...bookableVehicleWhere },
    include: {
      city: true,
      branch: true,
      images: { orderBy: { sortOrder: "asc" } },
      pricingRules: { where: { isActive: true } },
    },
  });
}

async function loadRules(vehicleId: string, cityId: string, days: string[]) {
  const first = days[0]!;
  const last = days[days.length - 1]!;
  const rules = await db.pricingRule.findMany({
    where: {
      isActive: true,
      OR: [{ vehicleId }, { cityId, vehicleId: null }, { cityId: null, vehicleId: null }],
      AND: [
        { OR: [{ startsOn: null }, { startsOn: { lte: new Date(`${last}T23:59:59Z`) } }] },
        { OR: [{ endsOn: null }, { endsOn: { gte: new Date(`${first}T00:00:00Z`) } }] },
      ],
    },
    orderBy: { priority: "desc" },
  });
  const dayRules: DayRule[] = [];
  const longDurationRules: LongDurationRule[] = [];
  let deliveryFeeXaf: number | null = null;
  for (const r of rules) {
    if (r.type === "WEEKEND_MULTIPLIER" && r.percentBps)
      dayRules.push({ name: r.name, weekend: true, percentBps: r.percentBps });
    if (r.type === "SEASONAL_MULTIPLIER" && r.percentBps) {
      const set = new Set<string>();
      const start = r.startsOn ?? new Date(`${first}T00:00:00Z`);
      const end = r.endsOn ?? new Date(`${last}T00:00:00Z`);
      for (let d = start; d <= end; d = addDays(d, 1)) set.add(d.toISOString().slice(0, 10));
      dayRules.push({ name: r.name, dates: set, percentBps: r.percentBps });
    }
    if (r.type === "LONG_DURATION_DISCOUNT" && r.percentBps && r.minDays)
      longDurationRules.push({ name: r.name, minDays: r.minDays, percentBps: r.percentBps });
    if (r.type === "DELIVERY_FEE" && r.amountXaf !== null && deliveryFeeXaf === null)
      deliveryFeeXaf = r.amountXaf;
  }
  return { dayRules, longDurationRules, deliveryFeeXaf };
}

async function loadPromo(code: string | null | undefined, userId: string | null, now: Date) {
  if (!code) return null;
  const promo = await db.promoCode.findUnique({ where: { code: code.trim().toUpperCase() } });
  if (!promo || !promo.isActive) throw new BookingError("PROMO_INVALID");
  if (promo.startsAt && promo.startsAt > now) throw new BookingError("PROMO_INVALID");
  if (promo.endsAt && promo.endsAt < now) throw new BookingError("PROMO_INVALID");
  if (promo.maxRedemptions && promo.redemptions >= promo.maxRedemptions)
    throw new BookingError("PROMO_INVALID");
  if (userId) {
    const used = await db.booking.count({
      where: {
        customerId: userId,
        promoCodeId: promo.id,
        status: { notIn: ["CANCELLED", "DRAFT"] },
      },
    });
    if (used >= promo.perUserLimit) throw new BookingError("PROMO_INVALID");
  }
  return promo;
}

export interface QuoteResult {
  quote: Quote;
  window: Window;
  days: string[];
  settings: PricingSettings;
  promoId: string | null;
  vehicle: NonNullable<Awaited<ReturnType<typeof getBookableVehicle>>>;
}

/** Build a quote for a vehicle/window/options. Throws AvailabilityError or BookingError. */
export async function quoteBooking(
  vehicleId: string,
  window: Window,
  options: BookingOptions,
  userId: string | null = null,
  now = new Date(),
): Promise<QuoteResult> {
  const vehicle = await getBookableVehicle(vehicleId);
  if (!vehicle) throw new BookingError("VEHICLE_NOT_BOOKABLE");
  if (options.chauffeur && !vehicle.chauffeurAvailable) throw new BookingError("DRIVE_OPTION");
  if (!options.chauffeur && !vehicle.selfDriveAllowed) throw new BookingError("DRIVE_OPTION");
  const settings = await getPricingSettings();
  validateWindowRules(
    window,
    {
      minAdvanceHours: settings.minAdvanceHours,
      minRentalDays: vehicle.minRentalDays,
      maxRentalDays: vehicle.maxRentalDays,
    },
    now,
  );
  const days = rentalCalendarDays(window);
  // Bookings, blocks and other customers' live holds make the window unavailable.
  if (!(await isWindowFree(db, vehicle.id, window, { ignoreHoldsOfUserId: userId, now }))) {
    throw new BookingError("UNAVAILABLE");
  }
  const { dayRules, longDurationRules, deliveryFeeXaf } = await loadRules(
    vehicle.id,
    vehicle.cityId,
    days,
  );
  const promo = await loadPromo(options.promoCode, userId, now);
  const quote = computeQuote({
    days,
    dailyRateXaf: vehicle.dailyPriceXaf,
    weeklyRateXaf: vehicle.weeklyPriceXaf,
    monthlyRateXaf: vehicle.monthlyPriceXaf,
    securityDepositXaf: vehicle.securityDepositXaf,
    dailyKmAllowance: vehicle.dailyKmAllowance,
    extraKmRateXaf: vehicle.extraKmRateXaf,
    chauffeur: options.chauffeur,
    chauffeurDailyFeeXaf: vehicle.chauffeurDailyFeeXaf,
    delivery: options.delivery && vehicle.deliveryAvailable,
    deliveryFeeXaf: deliveryFeeXaf ?? settings.deliveryFeeXaf,
    returnPickup: options.returnPickup && vehicle.deliveryAvailable,
    returnPickupFeeXaf: settings.returnPickupFeeXaf,
    additionalDrivers: options.chauffeur ? 0 : Math.max(0, Math.min(3, options.additionalDrivers)),
    additionalDriverFeeXafPerDay: settings.additionalDriverFeeXafPerDay,
    addOns: [],
    serviceFeeBps: settings.serviceFeeBps,
    taxBps: settings.taxBps,
    commissionBps: commissionBpsFor(vehicle.ownershipModel, settings),
    dayRules,
    longDurationRules,
    promo: promo
      ? {
          code: promo.code,
          discountType: promo.discountType,
          percentBps: promo.percentBps,
          amountXaf: promo.amountXaf,
          maxDiscountXaf: promo.maxDiscountXaf,
          minBookingXaf: promo.minBookingXaf,
        }
      : null,
  });
  return { quote, window, days, settings, promoId: promo?.id ?? null, vehicle };
}

/**
 * Create or refresh the checkout hold for this user/vehicle/window. The database exclusion
 * constraint guarantees two active holds never overlap; the vehicle row is locked so the
 * availability check and the insert are atomic.
 */
export async function ensureHold(input: {
  vehicleId: string;
  userId: string;
  window: Window;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const settings = await getPricingSettings();
  const expiresAt = addMinutes(now, settings.holdMinutes);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Vehicle" WHERE id = ${input.vehicleId} FOR UPDATE`;
    const existing = await tx.reservationHold.findFirst({
      where: {
        vehicleId: input.vehicleId,
        userId: input.userId,
        status: "ACTIVE",
        startAt: input.window.startAt,
        endAt: input.window.endAt,
      },
    });
    if (existing) {
      return tx.reservationHold.update({ where: { id: existing.id }, data: { expiresAt } });
    }
    await tx.reservationHold.updateMany({
      where: { vehicleId: input.vehicleId, userId: input.userId, status: "ACTIVE" },
      data: { status: "RELEASED" },
    });
    const free = await isWindowFree(tx, input.vehicleId, input.window, { now });
    if (!free) throw new BookingError("UNAVAILABLE");
    try {
      return await tx.reservationHold.create({
        data: {
          vehicleId: input.vehicleId,
          userId: input.userId,
          startAt: input.window.startAt,
          endAt: input.window.endAt,
          status: "ACTIVE",
          expiresAt,
        },
      });
    } catch (error) {
      if (isExclusionViolation(error)) throw new BookingError("UNAVAILABLE");
      throw error;
    }
  });
}

function isExclusionViolation(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /no_overlap_excl|exclusion constraint|23P01/i.test(message);
}

async function appendHistory(
  client: Prisma.TransactionClient | typeof db,
  bookingId: string,
  from: BookingStatus | null,
  to: BookingStatus,
  actorId: string | null,
  actorType: ActorType,
  reason?: string | null,
  metadata?: Prisma.InputJsonValue,
) {
  await client.bookingStatusHistory.create({
    data: {
      bookingId,
      fromStatus: from,
      toStatus: to,
      actorId,
      actorType,
      reason: reason ?? null,
      metadata,
    },
  });
}

async function writeSnapshot(
  client: Prisma.TransactionClient | typeof db,
  bookingId: string,
  quote: Quote,
) {
  const last = await client.bookingPriceSnapshot.findFirst({
    where: { bookingId },
    orderBy: { sequence: "desc" },
    select: { sequence: true },
  });
  return client.bookingPriceSnapshot.create({
    data: {
      bookingId,
      sequence: (last?.sequence ?? 0) + 1,
      rentalDays: quote.rentalDays,
      dailyRateXaf: quote.dailyRateXaf,
      baseRentalXaf: quote.baseRentalXaf,
      deliveryFeeXaf: quote.deliveryFeeXaf,
      returnPickupFeeXaf: quote.returnPickupFeeXaf,
      chauffeurFeeXaf: quote.chauffeurFeeXaf,
      additionalDriverXaf: quote.additionalDriverXaf,
      addOnsXaf: quote.addOnsXaf,
      serviceFeeXaf: quote.serviceFeeXaf,
      discountXaf: quote.discountXaf,
      taxXaf: quote.taxXaf,
      totalRentalXaf: quote.totalRentalXaf,
      securityDepositXaf: quote.securityDepositXaf,
      kmAllowance: quote.kmAllowance,
      extraKmRateXaf: quote.extraKmRateXaf,
      commissionBps: quote.commissionBps,
      commissionXaf: quote.commissionXaf,
      ownerShareXaf: quote.ownerShareXaf,
      breakdown: JSON.parse(
        JSON.stringify({
          lines: quote.lines,
          promoApplied: quote.promoApplied,
          grandTotalXaf: quote.grandTotalXaf,
        }),
      ) as Prisma.InputJsonValue,
      pricingVersion: quote.pricingVersion,
    },
  });
}

/**
 * Convert the customer's hold into a booking. Re-quotes server-side (never trusts the client
 * total), locks the vehicle row, re-validates availability, writes the immutable price
 * snapshot and the first status-history row. Status is PAYMENT_PENDING (or
 * PENDING_VERIFICATION for unverified self-drive customers) until a verified payment arrives.
 */
export async function createBooking(input: {
  vehicleId: string;
  userId: string;
  window: Window;
  options: BookingOptions;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const customer = await db.user.findUnique({
    where: { id: input.userId },
    include: { customerProfile: true },
  });
  if (!customer) throw new BookingError("FORBIDDEN");
  if (customer.status !== "ACTIVE") throw new BookingError("CUSTOMER_SUSPENDED");
  const { quote, vehicle, settings, promoId } = await quoteBooking(
    input.vehicleId,
    input.window,
    input.options,
    input.userId,
    now,
  );
  const verified = Boolean(customer.customerProfile?.approvedAt);
  const initialStatus: BookingStatus =
    !input.options.chauffeur && !verified ? "PENDING_VERIFICATION" : "PAYMENT_PENDING";
  const paymentDueAt = addMinutes(now, settings.paymentTimeoutMinutes);

  const booking = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Vehicle" WHERE id = ${vehicle.id} FOR UPDATE`;
    const hold = await tx.reservationHold.findFirst({
      where: {
        vehicleId: vehicle.id,
        userId: input.userId,
        status: "ACTIVE",
        startAt: input.window.startAt,
        endAt: input.window.endAt,
      },
    });
    if (hold && hold.expiresAt <= now) throw new BookingError("HOLD_EXPIRED");
    const free = await isWindowFree(tx, vehicle.id, input.window, { ignoreHoldId: hold?.id, now });
    if (!free) throw new BookingError("UNAVAILABLE");
    let created;
    try {
      created = await tx.booking.create({
        data: {
          reference: humanReference("RK"),
          customerId: input.userId,
          vehicleId: vehicle.id,
          type: input.options.chauffeur
            ? "CHAUFFEUR_DRIVEN"
            : quote.rentalDays >= 28
              ? "LONG_TERM"
              : "SELF_DRIVE",
          status: initialStatus,
          startAt: input.window.startAt,
          endAt: input.window.endAt,
          rentalDays: quote.rentalDays,
          pickupMode:
            input.options.delivery && vehicle.deliveryAvailable ? "DELIVERY" : "BRANCH_PICKUP",
          returnMode:
            input.options.returnPickup && vehicle.deliveryAvailable ? "DELIVERY" : "BRANCH_PICKUP",
          pickupCityId: vehicle.cityId,
          pickupBranchId: vehicle.branchId,
          returnBranchId: vehicle.branchId,
          pickupAddress: input.options.pickupAddress ?? null,
          returnAddress: input.options.returnAddress ?? null,
          promoCodeId: promoId,
          promoCodeValue: quote.promoApplied,
          additionalDrivers: input.options.chauffeur ? 0 : input.options.additionalDrivers,
          customerNotes: input.options.customerNotes ?? null,
          paymentDueAt:
            initialStatus === "PAYMENT_PENDING"
              ? paymentDueAt
              : addMinutes(now, settings.verificationTimeoutHours * 60),
        },
      });
    } catch (error) {
      if (isExclusionViolation(error)) throw new BookingError("UNAVAILABLE");
      throw error;
    }
    await writeSnapshot(tx, created.id, quote);
    await appendHistory(tx, created.id, null, initialStatus, input.userId, "USER");
    if (hold)
      await tx.reservationHold.update({
        where: { id: hold.id },
        data: { status: "CONVERTED", bookingId: created.id },
      });
    if (promoId)
      await tx.promoCode.update({
        where: { id: promoId },
        data: { redemptions: { increment: 1 } },
      });
    return created;
  });

  await recordAudit({
    actorId: input.userId,
    action: "booking.create",
    entityType: "Booking",
    entityId: booking.id,
    after: {
      reference: booking.reference,
      status: booking.status,
      totalRentalXaf: quote.totalRentalXaf,
    },
  });
  const locale = customer.preferredLocale === "en" ? "en" : "fr";
  await sendTemplatedNotification({
    templateKey: "booking_created",
    channel: "EMAIL",
    locale,
    to: customer.email,
    userId: customer.id,
    variables: {
      name: customer.name,
      reference: booking.reference,
      vehicle: `${vehicle.make} ${vehicle.model}`,
      start: formatIsoDate(booking.startAt),
      end: formatIsoDate(booking.endAt),
      total: formatXaf(quote.grandTotalXaf, locale),
    },
    entityType: "Booking",
    entityId: booking.id,
    dedupeKey: `booking_created:${booking.id}`,
  });
  return { booking, quote };
}

export async function getBookingForCustomer(bookingId: string, userId: string) {
  const booking = await db.booking.findFirst({
    where: { id: bookingId, customerId: userId },
    include: {
      vehicle: { include: { city: true, images: { where: { isPrimary: true }, take: 1 } } },
      pickupBranch: true,
      priceSnapshots: { orderBy: { sequence: "desc" } },
      statusHistory: { orderBy: { createdAt: "asc" } },
      payments: true,
    },
  });
  if (!booking) throw new BookingError("NOT_FOUND");
  return booking;
}

/** Customer cancellation with the configured policy; refund execution belongs to Milestone 4. */
export async function cancelBookingByCustomer(
  bookingId: string,
  userId: string,
  reason: string,
  now = new Date(),
) {
  const booking = await getBookingForCustomer(bookingId, userId);
  if (!CUSTOMER_CANCELLABLE.includes(booking.status)) throw new BookingError("INVALID_STATUS");
  assertTransition(booking.status, "CANCELLED");
  const settings = await getPricingSettings();
  const snapshot = booking.priceSnapshots[0];
  const fee =
    booking.status === "CONFIRMED" || booking.status === "READY_FOR_PICKUP"
      ? computeCancellationFee({
          totalRentalXaf: snapshot?.totalRentalXaf ?? 0,
          hoursBeforePickup: hoursUntil(booking.startAt, now),
          freeHours: settings.cancellationFreeHours,
          lateFeeBps: settings.cancellationLateFeeBps,
        })
      : 0;
  const updated = await db.$transaction(async (tx) => {
    const u = await tx.booking.update({
      where: { id: booking.id },
      data: {
        status: "CANCELLED",
        cancelledAt: now,
        cancellationReason: reason,
        cancelledById: userId,
        cancellationFeeXaf: fee,
        version: { increment: 1 },
      },
    });
    await appendHistory(tx, booking.id, booking.status, "CANCELLED", userId, "USER", reason, {
      cancellationFeeXaf: fee,
    });
    return u;
  });
  await recordAudit({
    actorId: userId,
    action: "booking.cancel",
    entityType: "Booking",
    entityId: booking.id,
    before: { status: booking.status },
    after: { status: "CANCELLED", cancellationFeeXaf: fee },
    reason,
  });
  const customer = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const locale = customer.preferredLocale === "en" ? "en" : "fr";
  await sendTemplatedNotification({
    templateKey: "booking_cancelled",
    channel: "EMAIL",
    locale,
    to: customer.email,
    userId,
    variables: {
      name: customer.name,
      reference: booking.reference,
      refund: formatXaf(Math.max(0, (snapshot?.totalRentalXaf ?? 0) - fee), locale),
    },
    entityType: "Booking",
    entityId: booking.id,
    dedupeKey: `booking_cancelled:${booking.id}`,
  });
  return { booking: updated, cancellationFeeXaf: fee };
}

/** Customer asks to extend an ACTIVE rental; a new price snapshot is computed for the extra days. */
export async function requestExtension(
  bookingId: string,
  userId: string,
  newEndAt: Date,
  now = new Date(),
) {
  const booking = await getBookingForCustomer(bookingId, userId);
  if (booking.status !== "ACTIVE") throw new BookingError("INVALID_STATUS");
  if (!(newEndAt > booking.endAt)) throw new BookingError("EXTENSION_INVALID");
  const free = await isWindowFree(
    db,
    booking.vehicleId,
    { startAt: booking.endAt, endAt: newEndAt },
    { ignoreBookingId: booking.id, now },
  );
  if (!free) throw new BookingError("UNAVAILABLE");
  const extraDays = rentalDaysBetween(booking.endAt, newEndAt);
  const settings = await getPricingSettings();
  const vehicle = await db.vehicle.findUniqueOrThrow({ where: { id: booking.vehicleId } });
  const days = rentalCalendarDays({ startAt: booking.endAt, endAt: newEndAt });
  const quote = computeQuote({
    days,
    dailyRateXaf: vehicle.dailyPriceXaf,
    weeklyRateXaf: vehicle.weeklyPriceXaf,
    monthlyRateXaf: vehicle.monthlyPriceXaf,
    securityDepositXaf: 0,
    chauffeur: booking.type === "CHAUFFEUR_DRIVEN",
    chauffeurDailyFeeXaf: vehicle.chauffeurDailyFeeXaf,
    delivery: false,
    deliveryFeeXaf: 0,
    returnPickup: false,
    returnPickupFeeXaf: 0,
    additionalDrivers: booking.additionalDrivers,
    additionalDriverFeeXafPerDay: settings.additionalDriverFeeXafPerDay,
    addOns: [],
    serviceFeeBps: settings.serviceFeeBps,
    taxBps: settings.taxBps,
    commissionBps: commissionBpsFor(vehicle.ownershipModel, settings),
  });
  const updated = await db.$transaction(async (tx) => {
    const u = await tx.booking.update({
      where: { id: booking.id },
      data: {
        status: "EXTENSION_REQUESTED",
        extensionRequestedEndAt: newEndAt,
        version: { increment: 1 },
      },
    });
    await writeSnapshot(tx, booking.id, quote);
    await appendHistory(tx, booking.id, "ACTIVE", "EXTENSION_REQUESTED", userId, "USER", null, {
      newEndAt: newEndAt.toISOString(),
      extraDays,
      extensionTotalXaf: quote.totalRentalXaf,
    });
    return u;
  });
  await recordAudit({
    actorId: userId,
    action: "booking.extension.request",
    entityType: "Booking",
    entityId: booking.id,
    after: { newEndAt, extraDays, extensionTotalXaf: quote.totalRentalXaf },
  });
  return { booking: updated, quote, extraDays };
}

/** Called by the payment flow (Milestone 4) once a payment is verified server-side. */
export async function confirmBookingAfterPayment(
  bookingId: string,
  actorType: ActorType = "WEBHOOK",
  reference?: string,
) {
  const booking = await db.booking.findUniqueOrThrow({ where: { id: bookingId } });
  if (booking.status === "CONFIRMED") return booking;
  assertTransition(booking.status, "CONFIRMED");
  const updated = await db.$transaction(async (tx) => {
    const u = await tx.booking.update({
      where: { id: bookingId },
      data: {
        status: "CONFIRMED",
        confirmedAt: new Date(),
        paymentDueAt: null,
        version: { increment: 1 },
      },
    });
    await appendHistory(
      tx,
      bookingId,
      booking.status,
      "CONFIRMED",
      null,
      actorType,
      reference ? `payment:${reference}` : "payment verified",
    );
    return u;
  });
  await recordAudit({
    actorType,
    action: "booking.confirm",
    entityType: "Booking",
    entityId: bookingId,
    before: { status: booking.status },
    after: { status: "CONFIRMED" },
    reason: reference,
  });
  return updated;
}

/** Staff transition (handover, completion, no-show, cancellation, override). */
export async function staffTransition(input: {
  bookingId: string;
  to: BookingStatus;
  actorId: string;
  reason?: string;
  extension?: "APPROVE" | "DECLINE";
}) {
  const booking = await db.booking.findUniqueOrThrow({ where: { id: input.bookingId } });
  if (booking.status === "EXTENSION_REQUESTED" && input.extension) {
    const approve = input.extension === "APPROVE";
    const updated = await db.$transaction(async (tx) => {
      const u = await tx.booking.update({
        where: { id: booking.id },
        data: {
          status: "ACTIVE",
          endAt:
            approve && booking.extensionRequestedEndAt
              ? booking.extensionRequestedEndAt
              : booking.endAt,
          rentalDays:
            approve && booking.extensionRequestedEndAt
              ? rentalDaysBetween(booking.startAt, booking.extensionRequestedEndAt)
              : booking.rentalDays,
          extensionRequestedEndAt: null,
          version: { increment: 1 },
        },
      });
      await appendHistory(
        tx,
        booking.id,
        "EXTENSION_REQUESTED",
        "ACTIVE",
        input.actorId,
        "USER",
        input.reason ?? (approve ? "extension approved" : "extension declined"),
        { extension: input.extension },
      );
      return u;
    });
    await recordAudit({
      actorId: input.actorId,
      action: approve ? "booking.extension.approve" : "booking.extension.decline",
      entityType: "Booking",
      entityId: booking.id,
      reason: input.reason,
    });
    return updated;
  }
  try {
    assertTransition(booking.status, input.to);
  } catch (error) {
    if (error instanceof BookingTransitionError)
      throw new BookingError("INVALID_STATUS", error.message);
    throw error;
  }
  const now = new Date();
  const data: Prisma.BookingUpdateInput = { status: input.to, version: { increment: 1 } };
  if (input.to === "ACTIVE") data.pickedUpAt = now;
  if (input.to === "COMPLETED") {
    data.completedAt = now;
    data.returnedAt = booking.returnedAt ?? now;
  }
  if (input.to === "CONFIRMED") {
    data.confirmedAt = now;
    data.paymentDueAt = null;
  }
  if (input.to === "CANCELLED" || input.to === "NO_SHOW") {
    data.cancelledAt = now;
    data.cancellationReason = input.reason ?? null;
    data.cancelledById = input.actorId;
    if (input.to === "NO_SHOW") {
      const snapshot = await db.bookingPriceSnapshot.findFirst({
        where: { bookingId: booking.id },
        orderBy: { sequence: "desc" },
      });
      data.cancellationFeeXaf = snapshot?.totalRentalXaf ?? 0;
    }
  }
  const updated = await db.$transaction(async (tx) => {
    const u = await tx.booking.update({ where: { id: booking.id }, data });
    await appendHistory(
      tx,
      booking.id,
      booking.status,
      input.to,
      input.actorId,
      "USER",
      input.reason ?? null,
    );
    return u;
  });
  await recordAudit({
    actorId: input.actorId,
    action: `booking.${input.to.toLowerCase()}`,
    entityType: "Booking",
    entityId: booking.id,
    before: { status: booking.status },
    after: { status: input.to },
    reason: input.reason,
  });
  return updated;
}

/** Cron: expire checkout holds and unpaid bookings past their payment deadline. */
export async function expireHoldsAndUnpaidBookings(now = new Date()) {
  const holds = await db.reservationHold.updateMany({
    where: { status: "ACTIVE", expiresAt: { lte: now } },
    data: { status: "EXPIRED" },
  });
  const unpaid = await db.booking.findMany({
    where: {
      status: { in: ["PAYMENT_PENDING", "PENDING_VERIFICATION"] },
      paymentDueAt: { lte: now },
    },
    select: { id: true, status: true, customerId: true },
  });
  for (const b of unpaid) {
    await db.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id: b.id },
        data: {
          status: "CANCELLED",
          cancelledAt: now,
          cancellationReason:
            b.status === "PAYMENT_PENDING" ? "payment timeout" : "verification timeout",
          version: { increment: 1 },
        },
      });
      await appendHistory(
        tx,
        b.id,
        b.status,
        "CANCELLED",
        null,
        "CRON",
        b.status === "PAYMENT_PENDING" ? "payment timeout" : "verification timeout",
      );
    });
    await recordAudit({
      actorType: "CRON",
      action: "booking.expire_unpaid",
      entityType: "Booking",
      entityId: b.id,
    });
  }
  logger.info("cron.expire_holds", { holdsExpired: holds.count, bookingsExpired: unpaid.length });
  return { holdsExpired: holds.count, bookingsExpired: unpaid.length };
}

export { BLOCKING_BOOKING_STATUSES, AvailabilityError };
