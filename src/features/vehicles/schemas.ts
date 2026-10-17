import { z } from "zod";

export const VEHICLE_CATEGORIES = [
  "ECONOMY",
  "COMPACT",
  "SEDAN",
  "SUV",
  "PICKUP",
  "VAN",
  "MINIBUS",
  "LUXURY",
  "UTILITY",
] as const;
export const BODY_TYPES = [
  "HATCHBACK",
  "SEDAN",
  "SUV",
  "PICKUP",
  "VAN",
  "MINIBUS",
  "COUPE",
  "CONVERTIBLE",
  "WAGON",
  "OTHER",
] as const;
export const TRANSMISSIONS = ["MANUAL", "AUTOMATIC"] as const;
export const FUEL_TYPES = ["PETROL", "DIESEL", "HYBRID", "ELECTRIC", "LPG"] as const;
export const OWNERSHIP_MODELS = [
  "RIDEKMER_OWNED",
  "FULLY_MANAGED_OWNER_VEHICLE",
  "SELF_MANAGED_MARKETPLACE_VEHICLE",
] as const;
export const SAFETY_EQUIPMENT = [
  "spare_wheel",
  "jack",
  "warning_triangle",
  "fire_extinguisher",
  "first_aid_kit",
  "abs",
  "airbags",
  "child_seat_anchors",
] as const;
export const ONBOARDING_STEPS = [
  "basics",
  "equipment",
  "location",
  "pricing",
  "photos",
  "documents",
  "arrangement",
  "review",
] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

const currentYear = new Date().getFullYear();
const intField = (min: number, max: number) => z.coerce.number().int().min(min).max(max);
const optionalInt = (min: number, max: number) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    intField(min, max).optional(),
  );
const optionalString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : undefined));
const bool = z.preprocess(
  (v) => v === "on" || v === "true" || v === true || v === "1",
  z.boolean(),
);

export const basicsSchema = z.object({
  registrationNumber: z
    .string()
    .trim()
    .min(4)
    .max(20)
    .transform((v) => v.toUpperCase().replace(/\s+/g, " "))
    // "EX-" is reserved for the sample cars the administration can add and remove.
    .refine((v) => !v.startsWith("EX-"), { message: "RESERVED_PLATE" }),
  vin: optionalString(17),
  make: z.string().trim().min(2).max(60),
  model: z.string().trim().min(1).max(60),
  trim: optionalString(60),
  manufacturingYear: intField(1990, currentYear + 1),
  firstRegistrationDate: optionalString(10),
  category: z.enum(VEHICLE_CATEGORIES),
  bodyType: z.enum(BODY_TYPES).default("OTHER"),
  colour: optionalString(40),
  transmission: z.enum(TRANSMISSIONS),
  fuelType: z.enum(FUEL_TYPES),
  // Owners often type the engine size in litres ("2.8", "3"): read small values as litres.
  engineCapacityCc: z.preprocess((v) => {
    if (v === "" || v === null || v === undefined) return undefined;
    const n = Number(String(v).replace(",", "."));
    return Number.isFinite(n) && n > 0 && n < 20 ? Math.round(n * 1000) : v;
  }, intField(500, 10000).optional()),
  seats: intField(1, 60),
  doors: optionalInt(2, 6),
  currentMileageKm: intField(0, 2_000_000),
  cityId: z.string().min(1),
});

export const equipmentSchema = z.object({
  hasAirConditioning: bool.default(false),
  hasBluetooth: bool.default(false),
  hasUsbCharging: bool.default(false),
  hasReversingCamera: bool.default(false),
  safetyEquipment: z.array(z.enum(SAFETY_EQUIPMENT)).default([]),
  descriptionFr: optionalString(2000),
  descriptionEn: optionalString(2000),
  existingDamageNotes: optionalString(2000),
});

export const locationSchema = z.object({
  branchId: optionalString(64),
  locationLabel: optionalString(160),
  latitude: z.preprocess(
    (v) => (v === "" || v === undefined ? undefined : v),
    z.coerce.number().min(-90).max(90).optional(),
  ),
  longitude: z.preprocess(
    (v) => (v === "" || v === undefined ? undefined : v),
    z.coerce.number().min(-180).max(180).optional(),
  ),
  deliveryAvailable: bool.default(false),
  deliveryRadiusKm: optionalInt(1, 500),
});

export const pricingSchema = z
  .object({
    dailyPriceXaf: intField(1000, 5_000_000),
    weeklyPriceXaf: optionalInt(1000, 30_000_000),
    monthlyPriceXaf: optionalInt(1000, 100_000_000),
    securityDepositXaf: intField(0, 20_000_000),
    dailyKmAllowance: optionalInt(10, 2000),
    extraKmRateXaf: optionalInt(10, 10000),
    selfDriveAllowed: bool.default(true),
    chauffeurAvailable: bool.default(false),
    chauffeurDailyFeeXaf: optionalInt(1000, 1_000_000),
    instantBooking: bool.default(false),
    minRentalDays: intField(1, 90).default(1),
    maxRentalDays: optionalInt(1, 365),
  })
  .refine((v) => v.selfDriveAllowed || v.chauffeurAvailable, {
    message: "driveOption",
    path: ["selfDriveAllowed"],
  })
  .refine((v) => !v.chauffeurAvailable || v.chauffeurDailyFeeXaf !== undefined, {
    message: "chauffeurFee",
    path: ["chauffeurDailyFeeXaf"],
  })
  .refine((v) => v.maxRentalDays === undefined || v.maxRentalDays >= v.minRentalDays, {
    message: "maxDays",
    path: ["maxRentalDays"],
  });

export const arrangementSchema = z.object({
  ownershipModel: z.enum(["FULLY_MANAGED_OWNER_VEHICLE", "SELF_MANAGED_MARKETPLACE_VEHICLE"]),
  ownerApprovesBookings: bool.default(false),
  ownerHandlesHandover: bool.default(false),
  ownerHandlesInspections: bool.default(false),
  ownerHandlesCustomerContact: bool.default(false),
  ownerHandlesMaintenance: bool.default(false),
  ownerApprovesExpensesAboveXaf: optionalInt(0, 50_000_000),
});

export const availabilityBlockSchema = z
  .object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    reason: optionalString(200),
  })
  .refine((v) => v.endDate >= v.startDate, { message: "dateOrder", path: ["endDate"] });

export const ownerRequestSchema = z.object({
  type: z.enum(["SUSPENSION", "WITHDRAWAL"]),
  reason: z.string().trim().min(5).max(500),
});

export type BasicsInput = z.infer<typeof basicsSchema>;
export type EquipmentInput = z.infer<typeof equipmentSchema>;
export type LocationInput = z.infer<typeof locationSchema>;
export type PricingInput = z.infer<typeof pricingSchema>;
export type ArrangementInput = z.infer<typeof arrangementSchema>;

/** Convert FormData into a plain object, collecting repeated keys into arrays. */
export function formToObject(formData: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (value instanceof File) continue;
    if (key.endsWith("[]")) {
      const name = key.slice(0, -2);
      const list = (out[name] as string[] | undefined) ?? [];
      list.push(value);
      out[name] = list;
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function issuesToErrors(error: z.ZodError): Record<string, string> {
  return Object.fromEntries(
    error.issues.map((i) => [
      i.path.join(".") || "_",
      i.message === "driveOption" ||
      i.message === "chauffeurFee" ||
      i.message === "maxDays" ||
      i.message === "dateOrder" ||
      i.message === "RESERVED_PLATE"
        ? i.message
        : i.code,
    ]),
  );
}
