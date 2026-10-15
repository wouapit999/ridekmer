import type { BookingStatus } from "@/generated/prisma/enums";

/** Pure rules shared by the privacy service, the housekeeping job and unit tests. */
export const BLOCKING_BOOKING_STATUSES: BookingStatus[] = [
  "PENDING_VERIFICATION",
  "PAYMENT_PENDING",
  "CONFIRMED",
  "READY_FOR_PICKUP",
  "ACTIVE",
  "EXTENSION_REQUESTED",
  "DISPUTED",
];

export const DEFAULT_DELETION_GRACE_DAYS = 30;

/** Anonymised replacement values (deterministic per user id, no personal data). */
export function anonymisedIdentity(userId: string) {
  return {
    name: "Compte supprimé / Deleted account",
    email: `deleted-${userId}@anonymised.invalid`,
    phoneNumber: null,
  };
}

/** A deletion request is due once the grace period has passed. */
export function deletionDue(requestedAt: Date, graceDays: number, now: Date): boolean {
  return now.getTime() - requestedAt.getTime() >= graceDays * 86_400_000;
}
