import { z } from "zod";

export const dateRe = /^\d{4}-\d{2}-\d{2}$/;
export const timeRe = /^\d{2}:\d{2}$/;
const bool = z.preprocess((v) => v === "on" || v === "true" || v === "1", z.boolean());

export const checkoutSchema = z.object({
  vehicleId: z.string().min(1),
  pickupDate: z.string().regex(dateRe),
  pickupTime: z.string().regex(timeRe),
  returnDate: z.string().regex(dateRe),
  returnTime: z.string().regex(timeRe),
  chauffeur: bool.default(false),
  delivery: bool.default(false),
  returnPickup: bool.default(false),
  additionalDrivers: z.coerce.number().int().min(0).max(3).default(0),
  promoCode: z.string().trim().max(40).optional().or(z.literal("")),
  pickupAddress: z.string().trim().max(300).optional().or(z.literal("")),
  returnAddress: z.string().trim().max(300).optional().or(z.literal("")),
  customerNotes: z.string().trim().max(1000).optional().or(z.literal("")),
  accept: bool.default(false),
});
