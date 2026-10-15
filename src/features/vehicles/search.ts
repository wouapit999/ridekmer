import { z } from "zod";

import { fromDoualaLocal } from "@/lib/dates";
import { db } from "@/server/db";

import type { Prisma } from "@/generated/prisma/client";

const BLOCKING_STATUSES = [
  "PENDING_VERIFICATION",
  "PAYMENT_PENDING",
  "CONFIRMED",
  "READY_FOR_PICKUP",
  "ACTIVE",
  "EXTENSION_REQUESTED",
] as const;

export const searchParamsSchema = z.object({
  city: z.string().trim().max(64).optional(),
  branch: z.string().trim().max(64).optional(),
  pickupDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  pickupTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  returnDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  returnTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  drive: z.enum(["self", "chauffeur"]).optional(),
  category: z.string().trim().max(32).optional(),
  transmission: z.enum(["MANUAL", "AUTOMATIC"]).optional(),
  fuel: z.string().trim().max(16).optional(),
  make: z.string().trim().max(64).optional(),
  model: z.string().trim().max(64).optional(),
  minSeats: z.coerce.number().int().min(1).max(60).optional(),
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  minDeposit: z.coerce.number().int().min(0).optional(),
  maxDeposit: z.coerce.number().int().min(0).optional(),
  delivery: z.enum(["1"]).optional(),
  instant: z.enum(["1"]).optional(),
  ac: z.enum(["1"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
});

export type VehicleSearchParams = z.infer<typeof searchParamsSchema>;

export const PAGE_SIZE = 12;

export function parseSearchParams(
  raw: Record<string, string | string[] | undefined>,
): VehicleSearchParams {
  const flat = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  );
  const cleaned = Object.fromEntries(
    Object.entries(flat).filter(([, v]) => v !== undefined && v !== ""),
  );
  const parsed = searchParamsSchema.safeParse(cleaned);
  return parsed.success ? parsed.data : { page: 1 };
}

export function searchWindow(params: VehicleSearchParams): { startAt: Date; endAt: Date } | null {
  if (!params.pickupDate || !params.returnDate) return null;
  const startAt = fromDoualaLocal(`${params.pickupDate}T${params.pickupTime ?? "09:00"}`);
  const endAt = fromDoualaLocal(`${params.returnDate}T${params.returnTime ?? "09:00"}`);
  if (endAt <= startAt) return null;
  return { startAt, endAt };
}

export function buildWhere(
  params: VehicleSearchParams,
  viewerUserId: string | null = null,
): Prisma.VehicleWhereInput {
  const where: Prisma.VehicleWhereInput = {
    status: "ACTIVE",
    documentsValid: true,
    deletedAt: null,
    publishedAt: { not: null },
  };
  if (params.city) where.city = { slug: params.city };
  if (params.branch) where.branch = { slug: params.branch };
  if (params.category)
    where.category = params.category as Prisma.EnumVehicleCategoryFilter["equals"];
  if (params.transmission) where.transmission = params.transmission;
  if (params.fuel) where.fuelType = params.fuel as Prisma.EnumFuelTypeFilter["equals"];
  if (params.make) where.make = { contains: params.make, mode: "insensitive" };
  if (params.model) where.model = { contains: params.model, mode: "insensitive" };
  if (params.minSeats) where.seats = { gte: params.minSeats };
  if (params.minPrice !== undefined || params.maxPrice !== undefined) {
    where.dailyPriceXaf = { gte: params.minPrice, lte: params.maxPrice };
  }
  if (params.minDeposit !== undefined || params.maxDeposit !== undefined) {
    where.securityDepositXaf = { gte: params.minDeposit, lte: params.maxDeposit };
  }
  if (params.drive === "chauffeur") where.chauffeurAvailable = true;
  if (params.drive === "self") where.selfDriveAllowed = true;
  if (params.delivery) where.deliveryAvailable = true;
  if (params.instant) where.instantBooking = true;
  if (params.ac) where.hasAirConditioning = true;

  const window = searchWindow(params);
  if (window) {
    const overlap = { startAt: { lt: window.endAt }, endAt: { gt: window.startAt } };
    where.bookings = { none: { status: { in: [...BLOCKING_STATUSES] }, ...overlap } };
    where.availabilityBlocks = { none: overlap };
    // Other customers' live checkout holds hide the vehicle; the viewer's own hold does not.
    where.reservationHolds = {
      none: {
        status: "ACTIVE",
        expiresAt: { gt: new Date() },
        ...overlap,
        ...(viewerUserId ? { NOT: { userId: viewerUserId } } : {}),
      },
    };
  }
  return where;
}

export async function searchVehicles(
  params: VehicleSearchParams,
  viewerUserId: string | null = null,
) {
  const where = buildWhere(params, viewerUserId);
  const [total, vehicles] = await Promise.all([
    db.vehicle.count({ where }),
    db.vehicle.findMany({
      where,
      orderBy: [{ instantBooking: "desc" }, { dailyPriceXaf: "asc" }],
      skip: (params.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        make: true,
        model: true,
        manufacturingYear: true,
        category: true,
        transmission: true,
        fuelType: true,
        seats: true,
        dailyPriceXaf: true,
        securityDepositXaf: true,
        chauffeurAvailable: true,
        selfDriveAllowed: true,
        instantBooking: true,
        deliveryAvailable: true,
        hasAirConditioning: true,
        ownershipModel: true,
        city: { select: { nameFr: true, nameEn: true, slug: true } },
        images: {
          where: { isPublic: true },
          orderBy: { sortOrder: "asc" },
          take: 1,
          select: { storageKey: true, altTextFr: true, altTextEn: true },
        },
      },
    }),
  ]);
  return {
    total,
    vehicles,
    page: params.page,
    pageSize: PAGE_SIZE,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

export async function listActiveCities() {
  return db.city.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { slug: true, nameFr: true, nameEn: true },
  });
}
