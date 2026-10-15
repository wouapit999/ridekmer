import { randomUUID } from "node:crypto";

import { addDays, addHours } from "date-fns";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  BookingError,
  cancelBookingByCustomer,
  confirmBookingAfterPayment,
  createBooking,
  ensureHold,
  expireHoldsAndUnpaidBookings,
  quoteBooking,
  requestExtension,
  staffTransition,
} from "@/features/bookings/service";
import { db } from "@/server/db";

let vehicleId: string;
let customerA: string;
let customerB: string;
let staffId: string;
const base = addDays(new Date(), 10);
base.setUTCHours(8, 0, 0, 0);
const window = { startAt: base, endAt: addDays(base, 3) };
const options = { chauffeur: false, delivery: false, returnPickup: false, additionalDrivers: 0 };

beforeAll(async () => {
  const city = await db.city.findUniqueOrThrow({ where: { slug: "douala" } });
  const vehicle = await db.vehicle.create({
    data: {
      registrationNumber: `BK-${randomUUID().slice(0, 6).toUpperCase()}`,
      ownershipModel: "FULLY_MANAGED_OWNER_VEHICLE",
      cityId: city.id,
      make: "Booking",
      model: "Tester",
      manufacturingYear: 2023,
      category: "SEDAN",
      transmission: "AUTOMATIC",
      fuelType: "PETROL",
      seats: 5,
      dailyPriceXaf: 30000,
      weeklyPriceXaf: 180000,
      securityDepositXaf: 100000,
      status: "ACTIVE",
      documentsValid: true,
      publishedAt: new Date(),
      chauffeurAvailable: true,
      chauffeurDailyFeeXaf: 10000,
      dailyKmAllowance: 150,
    },
  });
  vehicleId = vehicle.id;
  const [a, b, s] = await Promise.all([
    db.user.create({ data: { email: `cust-a-${randomUUID()}@ridekmer.test`, name: "Customer A" } }),
    db.user.create({ data: { email: `cust-b-${randomUUID()}@ridekmer.test`, name: "Customer B" } }),
    db.user.create({ data: { email: `ops-${randomUUID()}@ridekmer.test`, name: "Ops Agent" } }),
  ]);
  customerA = a.id;
  customerB = b.id;
  staffId = s.id;
  await db.customerProfile.create({
    data: { userId: customerA, firstName: "Customer", lastName: "A", approvedAt: new Date() },
  });
});

afterAll(async () => {
  // Bookings carry append-only snapshots and history, so test rows stay in the test database.
  await db.$disconnect();
});

describe("quotes and holds", () => {
  it("quotes with the weekly package and the configured service fee", async () => {
    const { quote } = await quoteBooking(
      vehicleId,
      { startAt: base, endAt: addDays(base, 7) },
      options,
      customerA,
    );
    expect(quote.rentalDays).toBe(7);
    expect(quote.baseRentalXaf).toBe(180000);
    expect(quote.serviceFeeXaf).toBe(9000);
    expect(quote.commissionXaf).toBe(36000);
  });

  it("rejects a quote with an invalid driving option", async () => {
    await expect(
      quoteBooking(
        vehicleId,
        window,
        { ...options, chauffeur: true, additionalDrivers: 1 },
        customerA,
      ),
    ).resolves.toBeDefined();
    await db.vehicle.update({ where: { id: vehicleId }, data: { selfDriveAllowed: false } });
    await expect(quoteBooking(vehicleId, window, options, customerA)).rejects.toMatchObject({
      code: "DRIVE_OPTION",
    });
    await db.vehicle.update({ where: { id: vehicleId }, data: { selfDriveAllowed: true } });
  });

  it("prevents a second customer from holding the same window", async () => {
    const hold = await ensureHold({ vehicleId, userId: customerA, window });
    expect(hold.status).toBe("ACTIVE");
    await expect(ensureHold({ vehicleId, userId: customerB, window })).rejects.toMatchObject({
      code: "UNAVAILABLE",
    });
    const refreshed = await ensureHold({ vehicleId, userId: customerA, window });
    expect(refreshed.id).toBe(hold.id);
  });
});

describe("booking creation, concurrency and lifecycle", () => {
  let bookingId: string;

  it("converts the hold into a PAYMENT_PENDING booking with an immutable snapshot", async () => {
    const { booking, quote } = await createBooking({
      vehicleId,
      userId: customerA,
      window,
      options,
    });
    bookingId = booking.id;
    expect(booking.status).toBe("PAYMENT_PENDING");
    expect(booking.paymentDueAt).not.toBeNull();
    expect(booking.reference.startsWith("RK-")).toBe(true);
    const snapshot = await db.bookingPriceSnapshot.findFirstOrThrow({ where: { bookingId } });
    expect(snapshot.totalRentalXaf).toBe(quote.totalRentalXaf);
    await expect(
      db.bookingPriceSnapshot.update({ where: { id: snapshot.id }, data: { totalRentalXaf: 1 } }),
    ).rejects.toThrow(/append-only/);
    const hold = await db.reservationHold.findFirstOrThrow({ where: { bookingId } });
    expect(hold.status).toBe("CONVERTED");
    const history = await db.bookingStatusHistory.findMany({ where: { bookingId } });
    expect(history.map((h) => h.toStatus)).toEqual(["PAYMENT_PENDING"]);
  });

  it("refuses overlapping bookings, including concurrent attempts", async () => {
    const overlapping = { startAt: addDays(base, 2), endAt: addDays(base, 5) };
    await expect(
      createBooking({ vehicleId, userId: customerB, window: overlapping, options }),
    ).rejects.toMatchObject({ code: "UNAVAILABLE" });
    const free = { startAt: addDays(base, 20), endAt: addDays(base, 22) };
    const results = await Promise.allSettled([
      createBooking({ vehicleId, userId: customerA, window: free, options }),
      createBooking({ vehicleId, userId: customerB, window: free, options }),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toBeInstanceOf(BookingError);
  });

  it("puts unverified self-drive customers in PENDING_VERIFICATION and chauffeur bookings in PAYMENT_PENDING", async () => {
    const w1 = { startAt: addDays(base, 30), endAt: addDays(base, 32) };
    const { booking: pending } = await createBooking({
      vehicleId,
      userId: customerB,
      window: w1,
      options,
    });
    expect(pending.status).toBe("PENDING_VERIFICATION");
    const w2 = { startAt: addDays(base, 40), endAt: addDays(base, 42) };
    const { booking: chauffeured } = await createBooking({
      vehicleId,
      userId: customerB,
      window: w2,
      options: { ...options, chauffeur: true },
    });
    expect(chauffeured.status).toBe("PAYMENT_PENDING");
    expect(chauffeured.type).toBe("CHAUFFEUR_DRIVEN");
  });

  it("confirms after payment, runs the rental and approves an extension", async () => {
    const confirmed = await confirmBookingAfterPayment(bookingId, "WEBHOOK", "mock-ref");
    expect(confirmed.status).toBe("CONFIRMED");
    // Milestone 5 gates: no accepted agreement / pickup inspection → refused unless overridden.
    await expect(
      staffTransition({ bookingId, to: "ACTIVE", actorId: staffId }),
    ).rejects.toMatchObject({
      code: "CONTRACT_NOT_ACCEPTED",
    });
    await staffTransition({ bookingId, to: "ACTIVE", actorId: staffId, override: true });
    const ext = await requestExtension(bookingId, customerA, addHours(window.endAt, 26));
    expect(ext.booking.status).toBe("EXTENSION_REQUESTED");
    expect(ext.extraDays).toBe(2);
    expect(ext.quote.rentalDays).toBe(2);
    const approved = await staffTransition({
      bookingId,
      to: "ACTIVE",
      actorId: staffId,
      extension: "APPROVE",
    });
    expect(approved.status).toBe("ACTIVE");
    expect(approved.rentalDays).toBe(5);
    expect(await db.bookingPriceSnapshot.count({ where: { bookingId } })).toBe(2);
    await expect(
      staffTransition({ bookingId, to: "CONFIRMED", actorId: staffId }),
    ).rejects.toMatchObject({ code: "INVALID_STATUS" });
    const done = await staffTransition({
      bookingId,
      to: "COMPLETED",
      actorId: staffId,
      override: true,
    });
    expect(done.status).toBe("COMPLETED");
  });

  it("applies the cancellation policy for customers", async () => {
    const soon = { startAt: addHours(new Date(), 12), endAt: addHours(new Date(), 60) };
    const { booking } = await createBooking({
      vehicleId,
      userId: customerA,
      window: soon,
      options,
    });
    await confirmBookingAfterPayment(booking.id, "WEBHOOK");
    const { cancellationFeeXaf } = await cancelBookingByCustomer(
      booking.id,
      customerA,
      "change of plans",
    );
    expect(cancellationFeeXaf).toBeGreaterThan(0);
    const after = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(after.status).toBe("CANCELLED");
    await expect(cancelBookingByCustomer(booking.id, customerA, "again")).rejects.toMatchObject({
      code: "INVALID_STATUS",
    });
  });

  it("expires stale holds and unpaid bookings", async () => {
    const w = { startAt: addDays(base, 50), endAt: addDays(base, 52) };
    await ensureHold({ vehicleId, userId: customerB, window: w });
    await db.reservationHold.updateMany({
      where: { vehicleId, userId: customerB, status: "ACTIVE" },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const { booking } = await createBooking({
      vehicleId,
      userId: customerB,
      window: { startAt: addDays(base, 60), endAt: addDays(base, 61) },
      options: { ...options, chauffeur: true },
    });
    await db.booking.update({
      where: { id: booking.id },
      data: { paymentDueAt: new Date(Date.now() - 1000) },
    });
    const result = await expireHoldsAndUnpaidBookings(new Date());
    expect(result.holdsExpired).toBeGreaterThanOrEqual(1);
    expect(result.bookingsExpired).toBeGreaterThanOrEqual(1);
    const expired = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(expired.status).toBe("CANCELLED");
    // The window is free again for another customer.
    await expect(ensureHold({ vehicleId, userId: customerA, window: w })).resolves.toMatchObject({
      status: "ACTIVE",
    });
  });
});
