import { describe, expect, it } from "vitest";

import {
  rentalCalendarDays,
  validateWindowRules,
  windowFromLocal,
  AvailabilityError,
} from "@/features/availability/service";
import {
  BOOKING_TRANSITIONS,
  BookingTransitionError,
  CUSTOMER_CANCELLABLE,
  assertTransition,
  canTransitionBooking,
} from "@/features/bookings/state-machine";

describe("booking state machine", () => {
  it("covers every status from the brief", () => {
    expect(Object.keys(BOOKING_TRANSITIONS).sort()).toEqual([
      "ACTIVE",
      "CANCELLED",
      "COMPLETED",
      "CONFIRMED",
      "DISPUTED",
      "DRAFT",
      "EXTENSION_REQUESTED",
      "NO_SHOW",
      "PAYMENT_PENDING",
      "PENDING_VERIFICATION",
      "READY_FOR_PICKUP",
    ]);
  });

  it("allows the happy path and blocks shortcuts", () => {
    expect(canTransitionBooking("PAYMENT_PENDING", "CONFIRMED")).toBe(true);
    expect(canTransitionBooking("CONFIRMED", "ACTIVE")).toBe(true);
    expect(canTransitionBooking("ACTIVE", "COMPLETED")).toBe(true);
    expect(canTransitionBooking("PAYMENT_PENDING", "ACTIVE")).toBe(false);
    expect(canTransitionBooking("CANCELLED", "CONFIRMED")).toBe(false);
    expect(canTransitionBooking("COMPLETED", "ACTIVE")).toBe(false);
    expect(() => assertTransition("DRAFT", "COMPLETED")).toThrow(BookingTransitionError);
  });

  it("only lets customers cancel before the rental starts", () => {
    expect(CUSTOMER_CANCELLABLE).toContain("CONFIRMED");
    expect(CUSTOMER_CANCELLABLE).not.toContain("ACTIVE");
    expect(CUSTOMER_CANCELLABLE).not.toContain("COMPLETED");
  });
});

describe("availability windows", () => {
  it("builds windows in Douala time and lists calendar days", () => {
    const w = windowFromLocal("2026-11-02", "09:00", "2026-11-04", "08:00");
    expect(w.startAt.toISOString()).toBe("2026-11-02T08:00:00.000Z");
    expect(rentalCalendarDays(w)).toEqual(["2026-11-02", "2026-11-03"]);
    expect(
      rentalCalendarDays(windowFromLocal("2026-11-02", "09:00", "2026-11-04", "10:00")),
    ).toEqual(["2026-11-02", "2026-11-03", "2026-11-04"]);
  });

  it("enforces advance notice and duration limits", () => {
    const now = new Date("2026-11-01T08:00:00.000Z");
    const w = windowFromLocal("2026-11-01", "10:00", "2026-11-03", "10:00");
    expect(() =>
      validateWindowRules(w, { minAdvanceHours: 4, minRentalDays: 1, maxRentalDays: null }, now),
    ).toThrow(AvailabilityError);
    expect(
      validateWindowRules(w, { minAdvanceHours: 1, minRentalDays: 1, maxRentalDays: null }, now),
    ).toBe(2);
    expect(() =>
      validateWindowRules(w, { minAdvanceHours: 1, minRentalDays: 3, maxRentalDays: null }, now),
    ).toThrow(/TOO_SHORT/);
    expect(() =>
      validateWindowRules(w, { minAdvanceHours: 1, minRentalDays: 1, maxRentalDays: 1 }, now),
    ).toThrow(/TOO_LONG/);
    expect(() => windowFromLocal("2026-11-03", "10:00", "2026-11-01", "10:00")).toThrow(
      /INVALID_RANGE/,
    );
  });
});
