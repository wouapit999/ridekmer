import type { BookingStatus } from "@/generated/prisma/enums";

/**
 * Booking status machine. Every transition is explicit; services call `assertTransition`
 * before writing and always append a BookingStatusHistory row.
 */
export const BOOKING_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  DRAFT: ["PENDING_VERIFICATION", "PAYMENT_PENDING", "CANCELLED"],
  PENDING_VERIFICATION: ["PAYMENT_PENDING", "CANCELLED"],
  PAYMENT_PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["READY_FOR_PICKUP", "ACTIVE", "CANCELLED", "NO_SHOW"],
  READY_FOR_PICKUP: ["ACTIVE", "CANCELLED", "NO_SHOW"],
  ACTIVE: ["EXTENSION_REQUESTED", "COMPLETED", "DISPUTED"],
  EXTENSION_REQUESTED: ["ACTIVE", "COMPLETED", "DISPUTED"],
  COMPLETED: ["DISPUTED"],
  CANCELLED: [],
  NO_SHOW: ["DISPUTED"],
  DISPUTED: ["COMPLETED"],
};

export const TERMINAL_STATUSES: BookingStatus[] = ["CANCELLED", "NO_SHOW"];
export const CUSTOMER_CANCELLABLE: BookingStatus[] = [
  "DRAFT",
  "PENDING_VERIFICATION",
  "PAYMENT_PENDING",
  "CONFIRMED",
  "READY_FOR_PICKUP",
];

export class BookingTransitionError extends Error {
  constructor(
    public readonly from: BookingStatus,
    public readonly to: BookingStatus,
  ) {
    super(`Invalid booking transition ${from} → ${to}`);
    this.name = "BookingTransitionError";
  }
}

export function canTransitionBooking(from: BookingStatus, to: BookingStatus): boolean {
  return BOOKING_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: BookingStatus, to: BookingStatus): void {
  if (!canTransitionBooking(from, to)) throw new BookingTransitionError(from, to);
}

/** Staff transitions and the permission each one needs. */
export const STAFF_TRANSITIONS: Array<{
  to: BookingStatus;
  permission: "booking.handover" | "booking.cancel" | "booking.override" | "booking.view_all";
}> = [
  { to: "READY_FOR_PICKUP", permission: "booking.handover" },
  { to: "ACTIVE", permission: "booking.handover" },
  { to: "COMPLETED", permission: "booking.handover" },
  { to: "NO_SHOW", permission: "booking.cancel" },
  { to: "CANCELLED", permission: "booking.cancel" },
  { to: "CONFIRMED", permission: "booking.override" },
  { to: "DISPUTED", permission: "booking.override" },
];
