"use server";

import { revalidatePath } from "next/cache";

import { AvailabilityError, windowFromLocal } from "@/features/availability/service";

import { checkoutSchema, dateRe, timeRe } from "./schemas";
import { requirePermissionOrThrow, getCurrentSession } from "@/server/auth/session";

import {
  BookingError,
  cancelBookingByCustomer,
  createBooking,
  ensureHold,
  requestExtension,
  staffTransition,
} from "./service";
import { STAFF_TRANSITIONS } from "./state-machine";

import type { BookingStatus } from "@/generated/prisma/enums";

export interface BookingActionResult {
  ok: boolean;
  message?: string;
  bookingId?: string;
  errors?: Record<string, string>;
}

function fail(error: unknown): BookingActionResult {
  if (error instanceof BookingError || error instanceof AvailabilityError)
    return { ok: false, message: error.code };
  throw error;
}

export async function confirmBookingAction(
  _prev: BookingActionResult,
  formData: FormData,
): Promise<BookingActionResult> {
  const current = await getCurrentSession();
  if (!current) return { ok: false, message: "UNAUTHENTICATED" };
  const parsed = checkoutSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success)
    return {
      ok: false,
      message: "INVALID",
      errors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.code])),
    };
  const d = parsed.data;
  if (!d.accept) return { ok: false, errors: { accept: "required" } };
  try {
    const window = windowFromLocal(d.pickupDate, d.pickupTime, d.returnDate, d.returnTime);
    const options = {
      chauffeur: d.chauffeur,
      delivery: d.delivery,
      returnPickup: d.returnPickup,
      additionalDrivers: d.additionalDrivers,
      promoCode: d.promoCode || null,
      pickupAddress: d.pickupAddress || null,
      returnAddress: d.returnAddress || null,
      customerNotes: d.customerNotes || null,
    };
    await ensureHold({ vehicleId: d.vehicleId, userId: current.user.id, window });
    const { booking } = await createBooking({
      vehicleId: d.vehicleId,
      userId: current.user.id,
      window,
      options,
    });
    revalidatePath("/[locale]/account/bookings", "layout");
    return { ok: true, bookingId: booking.id };
  } catch (error) {
    return fail(error);
  }
}

export async function cancelBookingAction(
  _prev: BookingActionResult,
  formData: FormData,
): Promise<BookingActionResult> {
  const current = await getCurrentSession();
  if (!current) return { ok: false, message: "UNAUTHENTICATED" };
  const bookingId = String(formData.get("bookingId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 3) return { ok: false, errors: { reason: "required" } };
  try {
    await cancelBookingByCustomer(bookingId, current.user.id, reason);
    revalidatePath("/[locale]/account/bookings", "layout");
    return { ok: true, bookingId, message: "CANCELLED" };
  } catch (error) {
    return fail(error);
  }
}

export async function requestExtensionAction(
  _prev: BookingActionResult,
  formData: FormData,
): Promise<BookingActionResult> {
  const current = await getCurrentSession();
  if (!current) return { ok: false, message: "UNAUTHENTICATED" };
  const bookingId = String(formData.get("bookingId") ?? "");
  const date = String(formData.get("newEndDate") ?? "");
  const time = String(formData.get("newEndTime") ?? "09:00");
  if (!dateRe.test(date) || !timeRe.test(time))
    return { ok: false, errors: { newEndDate: "required" } };
  try {
    const { fromDoualaLocal } = await import("@/lib/dates");
    await requestExtension(bookingId, current.user.id, fromDoualaLocal(`${date}T${time}`));
    revalidatePath("/[locale]/account/bookings", "layout");
    return { ok: true, bookingId, message: "EXTENSION_REQUESTED" };
  } catch (error) {
    return fail(error);
  }
}

export async function staffBookingTransitionAction(
  _prev: BookingActionResult,
  formData: FormData,
): Promise<BookingActionResult> {
  const to = String(formData.get("to") ?? "") as BookingStatus;
  const extension = formData.get("extension")
    ? (String(formData.get("extension")) as "APPROVE" | "DECLINE")
    : undefined;
  const rule = STAFF_TRANSITIONS.find((t) => t.to === to);
  if (!rule && !extension) return { ok: false, message: "INVALID" };
  const { user, access } = await requirePermissionOrThrow(
    extension ? "booking.override" : rule!.permission,
  );
  const override = formData.get("override") === "1" && access.permissions.has("booking.override");
  const bookingId = String(formData.get("bookingId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (["CANCELLED", "NO_SHOW", "CONFIRMED", "DISPUTED"].includes(to) && reason.length < 3)
    return { ok: false, message: "REASON_REQUIRED" };
  try {
    await staffTransition({
      bookingId,
      to,
      actorId: user.id,
      reason: reason || undefined,
      extension,
      override,
    });
    revalidatePath("/[locale]/admin/bookings", "layout");
    return { ok: true, bookingId, message: extension ?? to };
  } catch (error) {
    return fail(error);
  }
}
