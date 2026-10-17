/* eslint-disable no-console */
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  buildObjectKey,
  LocalDiskStorageProvider,
  S3StorageProvider,
  VercelBlobStorageProvider,
  type StorageProvider,
} from "@ridekmer/storage";
import { hashPassword } from "better-auth/crypto";

import type { PrismaClient } from "../../src/generated/prisma/client";
import { DEMO_PASSWORD } from "./demo";

/**
 * SHOWCASE sample data: 10 listings across five Cameroonian cities, 3 owners, 4 customers and
 * bookings at every stage, so the catalogue, the booking flow, the owner space and the
 * administration all have something to show. Every person, phone number and plate is
 * fictional ("(exemple)" in names, `.test` e-mails, `EX-` plates). Photos are free-licence
 * pictures of each model from Wikimedia Commons (see showcase-photos/credits.json).
 * Non-production only: called from seedDemoData behind ALLOW_DEMO_SEED.
 */

const PHOTO_DIR = path.resolve(process.cwd(), "prisma/seed-data/showcase-photos");

const EXTRA_CITIES = [
  {
    slug: "kribi",
    nameFr: "Kribi",
    nameEn: "Kribi",
    region: "Sud",
    latitude: 2.9395,
    longitude: 9.9087,
    sortOrder: 3,
  },
  {
    slug: "limbe",
    nameFr: "Limbé",
    nameEn: "Limbe",
    region: "Sud-Ouest",
    latitude: 4.0242,
    longitude: 9.2149,
    sortOrder: 4,
  },
  {
    slug: "bafoussam",
    nameFr: "Bafoussam",
    nameEn: "Bafoussam",
    region: "Ouest",
    latitude: 5.4781,
    longitude: 10.4176,
    sortOrder: 5,
  },
];

const OWNERS = [
  {
    email: "showcase.owner.paul@ridekmer.test",
    name: "Paul Mbarga (exemple)",
    phone: "+237600000011",
    type: "INDIVIDUAL",
  },
  {
    email: "showcase.owner.aicha@ridekmer.test",
    name: "Aïcha Bello (exemple)",
    phone: "+237600000012",
    type: "INDIVIDUAL",
  },
  {
    email: "showcase.owner.kmerauto@ridekmer.test",
    name: "Kmer Auto Services SARL (exemple)",
    phone: "+237600000013",
    type: "COMPANY",
  },
] as const;

const CUSTOMERS = [
  { email: "showcase.marie@ridekmer.test", name: "Marie Ngo (exemple)", phone: "+237600000021" },
  { email: "showcase.jean@ridekmer.test", name: "Jean Fotso (exemple)", phone: "+237600000022" },
  {
    email: "showcase.esther@ridekmer.test",
    name: "Esther Atangana (exemple)",
    phone: "+237600000023",
  },
  {
    email: "showcase.ibrahim@ridekmer.test",
    name: "Ibrahim Moussa (exemple)",
    phone: "+237600000024",
  },
] as const;

type Owner = (typeof OWNERS)[number]["email"] | null;

interface ShowcaseVehicle {
  plate: string;
  /** Neighbourhood shown next to the city for owner vehicles (agency vehicles show the branch). */
  area?: string;
  photo: string;
  make: string;
  model: string;
  year: number;
  city: string;
  category: "ECONOMY" | "COMPACT" | "SEDAN" | "SUV" | "PICKUP" | "MINIBUS" | "LUXURY";
  bodyType: "HATCHBACK" | "SEDAN" | "SUV" | "PICKUP" | "MINIBUS";
  transmission: "MANUAL" | "AUTOMATIC";
  fuelType: "PETROL" | "DIESEL" | "HYBRID";
  seats: number;
  doors: number;
  colour: string;
  daily: number;
  weekly: number;
  monthly: number;
  deposit: number;
  owner: Owner;
  ownership: "RIDEKMER_OWNED" | "FULLY_MANAGED_OWNER_VEHICLE" | "SELF_MANAGED_MARKETPLACE_VEHICLE";
  chauffeurFee?: number;
  selfDrive?: boolean;
  delivery?: boolean;
  instant: boolean;
  fr: string;
  en: string;
}

export const SHOWCASE_VEHICLES: ShowcaseVehicle[] = [
  {
    plate: "EX-101-DLA",
    photo: "toyota-corolla.jpg",
    make: "Toyota",
    model: "Corolla",
    year: 2022,
    city: "douala",
    category: "SEDAN",
    bodyType: "SEDAN",
    transmission: "AUTOMATIC",
    fuelType: "HYBRID",
    seats: 5,
    doors: 5,
    colour: "Blanc",
    daily: 30000,
    weekly: 190000,
    monthly: 700000,
    deposit: 150000,
    owner: null,
    ownership: "RIDEKMER_OWNED",
    instant: true,
    fr: "Berline hybride sobre et climatisée, parfaite pour les déplacements en ville et les rendez-vous d'affaires à Douala.",
    en: "Fuel-efficient air-conditioned hybrid, ideal for city driving and business meetings in Douala.",
  },
  {
    plate: "EX-102-YDE",
    area: "Bastos",
    photo: "toyota-land-cruiser-prado.jpg",
    make: "Toyota",
    model: "Land Cruiser Prado",
    year: 2023,
    city: "yaounde",
    category: "SUV",
    bodyType: "SUV",
    transmission: "AUTOMATIC",
    fuelType: "DIESEL",
    seats: 7,
    doors: 5,
    colour: "Blanc nacré",
    daily: 85000,
    weekly: 550000,
    monthly: 2000000,
    deposit: 400000,
    owner: "showcase.owner.paul@ridekmer.test",
    ownership: "FULLY_MANAGED_OWNER_VEHICLE",
    chauffeurFee: 20000,
    instant: true,
    fr: "4x4 7 places, robuste et confortable pour les missions, les mariages et les routes de l'intérieur. Chauffeur disponible.",
    en: "Rugged, comfortable 7-seat 4x4 for assignments, weddings and upcountry roads. Chauffeur available.",
  },
  {
    plate: "EX-103-DLA",
    area: "Bonapriso",
    photo: "hyundai-tucson.jpg",
    make: "Hyundai",
    model: "Tucson",
    year: 2022,
    city: "douala",
    category: "SUV",
    bodyType: "SUV",
    transmission: "AUTOMATIC",
    fuelType: "PETROL",
    seats: 5,
    doors: 5,
    colour: "Gris",
    daily: 50000,
    weekly: 320000,
    monthly: 1150000,
    deposit: 250000,
    owner: "showcase.owner.aicha@ridekmer.test",
    ownership: "SELF_MANAGED_MARKETPLACE_VEHICLE",
    delivery: true,
    instant: false,
    fr: "SUV récent et spacieux, caméra de recul et Bluetooth. Livraison possible à Bonapriso, Akwa et Bonamoussadi.",
    en: "Recent, roomy SUV with reversing camera and Bluetooth. Delivery available in Bonapriso, Akwa and Bonamoussadi.",
  },
  {
    plate: "EX-104-BFS",
    area: "Tamdja",
    photo: "toyota-hilux.jpg",
    make: "Toyota",
    model: "Hilux",
    year: 2021,
    city: "bafoussam",
    category: "PICKUP",
    bodyType: "PICKUP",
    transmission: "MANUAL",
    fuelType: "DIESEL",
    seats: 5,
    doors: 4,
    colour: "Blanc",
    daily: 55000,
    weekly: 350000,
    monthly: 1250000,
    deposit: 300000,
    owner: "showcase.owner.kmerauto@ridekmer.test",
    ownership: "FULLY_MANAGED_OWNER_VEHICLE",
    instant: true,
    fr: "Pick-up double cabine 4x4, idéal pour les chantiers, l'agriculture et les pistes de l'Ouest.",
    en: "Double-cab 4x4 pickup, ideal for building sites, farming and the tracks of the West region.",
  },
  {
    plate: "EX-105-DLA",
    area: "Akwa",
    photo: "suzuki-swift.jpg",
    make: "Suzuki",
    model: "Swift",
    year: 2023,
    city: "douala",
    category: "ECONOMY",
    bodyType: "HATCHBACK",
    transmission: "MANUAL",
    fuelType: "PETROL",
    seats: 5,
    doors: 5,
    colour: "Gris clair",
    daily: 20000,
    weekly: 125000,
    monthly: 450000,
    deposit: 100000,
    owner: "showcase.owner.aicha@ridekmer.test",
    ownership: "SELF_MANAGED_MARKETPLACE_VEHICLE",
    instant: true,
    fr: "Citadine économique et facile à garer, la solution la moins chère pour circuler en ville.",
    en: "Economical city car that is easy to park: the cheapest way to get around town.",
  },
  {
    plate: "EX-106-YDE",
    area: "Golf",
    photo: "mercedes-benz-e-class.jpg",
    make: "Mercedes-Benz",
    model: "E-Class",
    year: 2024,
    city: "yaounde",
    category: "LUXURY",
    bodyType: "SEDAN",
    transmission: "AUTOMATIC",
    fuelType: "PETROL",
    seats: 5,
    doors: 4,
    colour: "Blanc",
    daily: 120000,
    weekly: 780000,
    monthly: 2800000,
    deposit: 600000,
    owner: "showcase.owner.kmerauto@ridekmer.test",
    ownership: "FULLY_MANAGED_OWNER_VEHICLE",
    chauffeurFee: 25000,
    selfDrive: false,
    instant: false,
    fr: "Berline de prestige avec chauffeur professionnel pour délégations, cérémonies et accueil VIP.",
    en: "Executive sedan with a professional chauffeur for delegations, ceremonies and VIP pick-ups.",
  },
  {
    plate: "EX-107-KRI",
    area: "Centre-ville",
    photo: "toyota-rav4.jpg",
    make: "Toyota",
    model: "RAV4",
    year: 2022,
    city: "kribi",
    category: "SUV",
    bodyType: "SUV",
    transmission: "AUTOMATIC",
    fuelType: "PETROL",
    seats: 5,
    doors: 5,
    colour: "Gris",
    daily: 45000,
    weekly: 290000,
    monthly: 1050000,
    deposit: 250000,
    owner: "showcase.owner.paul@ridekmer.test",
    ownership: "FULLY_MANAGED_OWNER_VEHICLE",
    delivery: true,
    instant: true,
    fr: "SUV fiable pour un week-end à la plage ou une mission au port de Kribi. Livraison à l'hôtel possible.",
    en: "Reliable SUV for a beach weekend or a job at the port of Kribi. Hotel delivery available.",
  },
  {
    plate: "EX-108-DLA",
    area: "Bonamoussadi",
    photo: "toyota-hiace.jpg",
    make: "Toyota",
    model: "HiAce",
    year: 2020,
    city: "douala",
    category: "MINIBUS",
    bodyType: "MINIBUS",
    transmission: "MANUAL",
    fuelType: "DIESEL",
    seats: 14,
    doors: 4,
    colour: "Gris argent",
    daily: 70000,
    weekly: 450000,
    monthly: 1600000,
    deposit: 300000,
    owner: "showcase.owner.kmerauto@ridekmer.test",
    ownership: "FULLY_MANAGED_OWNER_VEHICLE",
    chauffeurFee: 20000,
    selfDrive: false,
    instant: true,
    fr: "Minibus 14 places avec chauffeur pour les transferts aéroport, les sorties d'équipe et les événements.",
    en: "14-seat minibus with chauffeur for airport transfers, team outings and events.",
  },
  {
    plate: "EX-109-LMB",
    area: "Down Beach",
    photo: "nissan-x-trail.jpg",
    make: "Nissan",
    model: "X-Trail",
    year: 2021,
    city: "limbe",
    category: "SUV",
    bodyType: "SUV",
    transmission: "AUTOMATIC",
    fuelType: "PETROL",
    seats: 7,
    doors: 5,
    colour: "Cuivre",
    daily: 45000,
    weekly: 290000,
    monthly: 1050000,
    deposit: 250000,
    owner: "showcase.owner.paul@ridekmer.test",
    ownership: "SELF_MANAGED_MARKETPLACE_VEHICLE",
    instant: false,
    fr: "SUV 7 places pour découvrir Limbé, Buea et le mont Cameroun en famille.",
    en: "7-seat SUV to explore Limbe, Buea and Mount Cameroon with the family.",
  },
  {
    plate: "EX-110-YDE",
    photo: "hyundai-accent.jpg",
    make: "Hyundai",
    model: "Accent",
    year: 2021,
    city: "yaounde",
    category: "COMPACT",
    bodyType: "SEDAN",
    transmission: "AUTOMATIC",
    fuelType: "PETROL",
    seats: 5,
    doors: 4,
    colour: "Bleu gris",
    daily: 25000,
    weekly: 160000,
    monthly: 580000,
    deposit: 120000,
    owner: null,
    ownership: "RIDEKMER_OWNED",
    instant: true,
    fr: "Berline compacte automatique, économique et confortable pour circuler à Yaoundé.",
    en: "Compact automatic sedan, economical and comfortable for getting around Yaoundé.",
  },
];

function storageFromEnv(): StorageProvider | null {
  try {
    const kind = process.env.STORAGE_PROVIDER ?? "local";
    if (kind === "vercel-blob" && process.env.BLOB_READ_WRITE_TOKEN)
      return new VercelBlobStorageProvider({ token: process.env.BLOB_READ_WRITE_TOKEN });
    if (
      kind === "s3" &&
      process.env.S3_BUCKET &&
      process.env.S3_REGION &&
      process.env.S3_ACCESS_KEY_ID &&
      process.env.S3_SECRET_ACCESS_KEY
    )
      return new S3StorageProvider({
        endpoint: process.env.S3_ENDPOINT,
        region: process.env.S3_REGION,
        bucket: process.env.S3_BUCKET,
        accessKeyId: process.env.S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
      });
    if (kind === "local" && process.env.BETTER_AUTH_SECRET && process.env.NEXT_PUBLIC_APP_URL)
      return new LocalDiskStorageProvider(
        process.env.STORAGE_LOCAL_ROOT ?? path.resolve(process.cwd(), ".ridekmer-local-storage"),
        process.env.BETTER_AUTH_SECRET,
        process.env.NEXT_PUBLIC_APP_URL,
        { allowInProduction: Boolean(process.env.STORAGE_LOCAL_ROOT) },
      );
  } catch (error) {
    console.warn("Showcase photos skipped: storage not usable", error);
  }
  return null;
}

async function upsertUser(
  prisma: PrismaClient,
  input: { email: string; name: string; phone: string; roles: string[] },
  passwordHash: string,
) {
  const roles = await prisma.role.findMany({ where: { key: { in: input.roles } } });
  const user = await prisma.user.upsert({
    where: { email: input.email },
    update: { name: input.name },
    create: {
      email: input.email,
      name: input.name,
      emailVerified: true,
      phoneNumber: input.phone,
      phoneNumberVerified: true,
      preferredLocale: "fr",
    },
  });
  await prisma.account.upsert({
    where: { providerId_accountId: { providerId: "credential", accountId: user.id } },
    update: { password: passwordHash },
    create: {
      providerId: "credential",
      accountId: user.id,
      userId: user.id,
      password: passwordHash,
    },
  });
  for (const role of roles)
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id, assignedBy: "seed" },
    });
  return user;
}

export async function seedShowcaseData(prisma: PrismaClient) {
  if (process.env.NODE_ENV === "production" || process.env.APP_ENV === "production") {
    throw new Error("Showcase data must never be seeded in production");
  }
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const now = new Date();
  const day = 24 * 60 * 60 * 1000;

  for (const city of EXTRA_CITIES)
    await prisma.city.upsert({ where: { slug: city.slug }, update: {}, create: city });
  const cities = new Map((await prisma.city.findMany()).map((c) => [c.slug, c]));
  const branches = new Map((await prisma.branch.findMany()).map((b) => [b.cityId, b]));

  const ownerProfiles = new Map<string, string>();
  for (const o of OWNERS) {
    const user = await upsertUser(
      prisma,
      { ...o, roles: ["vehicle_owner", "customer"] },
      passwordHash,
    );
    const profile = await prisma.ownerProfile.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        ownerType: o.type,
        displayName: o.name,
        onboardingStep: "vehicles",
        onboardingComplete: true,
        kycApprovedAt: new Date(now.getTime() - 60 * day),
        kycApprovedBy: "seed",
      },
    });
    ownerProfiles.set(o.email, profile.id);
  }

  const customers = new Map<string, string>();
  for (const c of CUSTOMERS) {
    const user = await upsertUser(prisma, { ...c, roles: ["customer"] }, passwordHash);
    const [firstName, ...rest] = c.name.replace(" (exemple)", "").split(" ");
    await prisma.customerProfile.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        firstName: firstName ?? "Client",
        lastName: rest.join(" ") || "Exemple",
        nationality: "CM",
        identityVerifiedAt: new Date(now.getTime() - 30 * day),
        licenceVerifiedAt: new Date(now.getTime() - 30 * day),
        approvedAt: new Date(now.getTime() - 30 * day),
        approvedBy: "seed",
      },
    });
    customers.set(c.email, user.id);
  }

  const credits = JSON.parse(
    await readFile(path.join(PHOTO_DIR, "credits.json"), "utf8"),
  ) as Array<{
    file: string;
    author: string | null;
    license: string;
  }>;
  const creditFor = (file: string, lang: "fr" | "en") => {
    const c = credits.find((x) => x.file === file);
    if (!c) return "";
    const who = c.author ? `${c.author}, ` : "";
    return lang === "fr"
      ? ` Photo du modèle : ${who}${c.license}, via Wikimedia Commons.`
      : ` Model photo: ${who}${c.license}, via Wikimedia Commons.`;
  };
  const storage = storageFromEnv();
  const vehicles = new Map<string, { id: string; v: ShowcaseVehicle }>();
  for (const v of SHOWCASE_VEHICLES) {
    const city = cities.get(v.city);
    if (!city) throw new Error(`City ${v.city} missing`);
    const vehicle = await prisma.vehicle.upsert({
      where: { registrationNumber: v.plate },
      update: {
        descriptionFr: v.fr + creditFor(v.photo, "fr"),
        descriptionEn: v.en + creditFor(v.photo, "en"),
        locationLabel: v.ownership === "RIDEKMER_OWNED" ? null : (v.area ?? null),
        existingDamageNotes: null,
      },
      create: {
        registrationNumber: v.plate,
        make: v.make,
        model: v.model,
        manufacturingYear: v.year,
        category: v.category,
        bodyType: v.bodyType,
        transmission: v.transmission,
        fuelType: v.fuelType,
        seats: v.seats,
        doors: v.doors,
        colour: v.colour,
        currentMileageKm: 20000 + (v.year % 7) * 9000,
        dailyPriceXaf: v.daily,
        weeklyPriceXaf: v.weekly,
        monthlyPriceXaf: v.monthly,
        securityDepositXaf: v.deposit,
        dailyKmAllowance: 250,
        extraKmRateXaf: 150,
        ownershipModel: v.ownership,
        ownerProfileId: v.owner ? (ownerProfiles.get(v.owner) ?? null) : null,
        cityId: city.id,
        branchId: v.ownership === "RIDEKMER_OWNED" ? (branches.get(city.id)?.id ?? null) : null,
        locationLabel: v.ownership === "RIDEKMER_OWNED" ? null : (v.area ?? null),
        latitude: city.latitude,
        longitude: city.longitude,
        status: "ACTIVE",
        documentsValid: true,
        publishedAt: new Date(now.getTime() - 45 * day),
        hasAirConditioning: true,
        hasBluetooth: true,
        hasUsbCharging: true,
        hasReversingCamera: v.daily >= 45000,
        safetyEquipment: [
          "spare_wheel",
          "jack",
          "warning_triangle",
          "fire_extinguisher",
          "first_aid_kit",
        ],
        chauffeurAvailable: Boolean(v.chauffeurFee),
        chauffeurDailyFeeXaf: v.chauffeurFee ?? null,
        selfDriveAllowed: v.selfDrive ?? true,
        deliveryAvailable: Boolean(v.delivery),
        deliveryRadiusKm: v.delivery ? 15 : null,
        instantBooking: v.instant,
        descriptionFr: v.fr + creditFor(v.photo, "fr"),
        descriptionEn: v.en + creditFor(v.photo, "en"),
      },
    });
    vehicles.set(v.plate, { id: vehicle.id, v });

    const hasImage = await prisma.vehicleImage.count({ where: { vehicleId: vehicle.id } });
    if (!hasImage && storage) {
      try {
        const body = await readFile(path.join(PHOTO_DIR, v.photo));
        const key = buildObjectKey({
          scope: "vehicle-images",
          entityId: vehicle.id,
          fileId: randomUUID(),
          extension: "jpg",
        });
        await storage.put({ key, body, contentType: "image/jpeg" });
        await prisma.vehicleImage.create({
          data: {
            vehicleId: vehicle.id,
            storageKey: key,
            checksumSha256: createHash("sha256").update(body).digest("hex"),
            altTextFr: `${v.make} ${v.model} (photo du modèle, licence libre)`,
            altTextEn: `${v.make} ${v.model} (model photo, free licence)`,
            sortOrder: 0,
            isPrimary: true,
            isPublic: true,
          },
        });
      } catch (error) {
        console.warn(
          `Showcase photo for ${v.plate} skipped:`,
          error instanceof Error ? error.message : error,
        );
      }
    }
  }

  // Bookings at every stage. Prices follow the listing (daily rate × days + chauffeur).
  const bookings: Array<{
    ref: string;
    plate: string;
    customer: string;
    startInDays: number;
    days: number;
    status: "COMPLETED" | "ACTIVE" | "CONFIRMED" | "PAYMENT_PENDING" | "CANCELLED";
    chauffeur?: boolean;
  }> = [
    {
      ref: "RK-EX-0001",
      plate: "EX-101-DLA",
      customer: "showcase.marie@ridekmer.test",
      startInDays: -20,
      days: 3,
      status: "COMPLETED",
    },
    {
      ref: "RK-EX-0002",
      plate: "EX-102-YDE",
      customer: "showcase.jean@ridekmer.test",
      startInDays: -1,
      days: 4,
      status: "ACTIVE",
      chauffeur: true,
    },
    {
      ref: "RK-EX-0003",
      plate: "EX-103-DLA",
      customer: "showcase.esther@ridekmer.test",
      startInDays: 6,
      days: 5,
      status: "CONFIRMED",
    },
    {
      ref: "RK-EX-0004",
      plate: "EX-108-DLA",
      customer: "showcase.ibrahim@ridekmer.test",
      startInDays: 9,
      days: 2,
      status: "PAYMENT_PENDING",
      chauffeur: true,
    },
    {
      ref: "RK-EX-0005",
      plate: "EX-105-DLA",
      customer: "showcase.marie@ridekmer.test",
      startInDays: 3,
      days: 2,
      status: "CANCELLED",
    },
    {
      ref: "RK-EX-0006",
      plate: "EX-107-KRI",
      customer: "showcase.jean@ridekmer.test",
      startInDays: 14,
      days: 3,
      status: "CONFIRMED",
    },
    {
      ref: "RK-EX-0007",
      plate: "EX-110-YDE",
      customer: "showcase.esther@ridekmer.test",
      startInDays: -40,
      days: 7,
      status: "COMPLETED",
    },
  ];
  for (const b of bookings) {
    if (await prisma.booking.findUnique({ where: { reference: b.ref } })) continue;
    const entry = vehicles.get(b.plate)!;
    const v = entry.v;
    const startAt = new Date(now.getTime() + b.startInDays * day);
    startAt.setUTCHours(8, 0, 0, 0);
    const endAt = new Date(startAt.getTime() + b.days * day);
    const base = v.daily * b.days;
    const chauffeurFee = b.chauffeur ? (v.chauffeurFee ?? 0) * b.days : 0;
    const total = base + chauffeurFee;
    const commissionBps = v.ownership === "SELF_MANAGED_MARKETPLACE_VEHICLE" ? 1500 : 2500;
    const commission = Math.round((total * commissionBps) / 10000);
    const city = cities.get(v.city)!;
    const createdAt = new Date(startAt.getTime() - 5 * day);
    const booking = await prisma.booking.create({
      data: {
        reference: b.ref,
        customerId: customers.get(b.customer)!,
        vehicleId: entry.id,
        type: b.chauffeur ? "CHAUFFEUR_DRIVEN" : "SELF_DRIVE",
        status: b.status,
        startAt,
        endAt,
        rentalDays: b.days,
        pickupCityId: city.id,
        pickupBranchId: branches.get(city.id)?.id ?? null,
        confirmedAt: ["COMPLETED", "ACTIVE", "CONFIRMED"].includes(b.status) ? createdAt : null,
        pickedUpAt: ["COMPLETED", "ACTIVE"].includes(b.status) ? startAt : null,
        returnedAt: b.status === "COMPLETED" ? endAt : null,
        completedAt: b.status === "COMPLETED" ? endAt : null,
        cancelledAt: b.status === "CANCELLED" ? createdAt : null,
        cancellationReason: b.status === "CANCELLED" ? "Changement de programme (exemple)" : null,
        paymentDueAt: b.status === "PAYMENT_PENDING" ? new Date(now.getTime() + 2 * day) : null,
        createdAt,
        priceSnapshots: {
          create: {
            sequence: 1,
            rentalDays: b.days,
            dailyRateXaf: v.daily,
            baseRentalXaf: base,
            chauffeurFeeXaf: chauffeurFee,
            totalRentalXaf: total,
            securityDepositXaf: b.chauffeur ? 0 : v.deposit,
            kmAllowance: 250 * b.days,
            extraKmRateXaf: 150,
            commissionBps,
            commissionXaf: commission,
            ownerShareXaf: total - commission,
            breakdown: {
              lines: [
                { label: "rental", amountXaf: base },
                { label: "chauffeur", amountXaf: chauffeurFee },
              ],
            },
            pricingVersion: "showcase",
          },
        },
        statusHistory: {
          create: [
            {
              fromStatus: null,
              toStatus: "PAYMENT_PENDING",
              actorType: "SYSTEM",
              reason: "booking created (example)",
              createdAt,
            },
            ...(b.status === "PAYMENT_PENDING"
              ? []
              : [
                  {
                    fromStatus: "PAYMENT_PENDING" as const,
                    toStatus:
                      b.status === "CANCELLED" ? ("CANCELLED" as const) : ("CONFIRMED" as const),
                    actorType: "SYSTEM" as const,
                    reason: "example",
                    createdAt,
                  },
                ]),
          ],
        },
      },
    });
    if (["COMPLETED", "ACTIVE", "CONFIRMED"].includes(b.status)) {
      await prisma.payment.create({
        data: {
          bookingId: booking.id,
          purpose: "RENTAL",
          method: b.ref.endsWith("2") || b.ref.endsWith("6") ? "ORANGE_MONEY" : "MTN_MOBILE_MONEY",
          provider: "mock",
          status: "SUCCESSFUL",
          amountXaf: total + (b.chauffeur ? 0 : v.deposit),
          depositXaf: b.chauffeur ? 0 : v.deposit,
          idempotencyKey: `showcase-${b.ref}`,
          providerReference: `EX-${b.ref}`,
          providerEnvironment: "sandbox",
          payerPhoneMasked: "+237 6•• ••• •21",
          description: `${b.ref} (exemple)`,
          confirmedAt: createdAt,
          reconciledAt: b.status === "COMPLETED" ? endAt : null,
          createdAt,
        },
      });
    }
  }
  console.log(
    `Showcase: ${SHOWCASE_VEHICLES.length} sample vehicles, ${OWNERS.length} owners, ${CUSTOMERS.length} customers and ${bookings.length} bookings (password: ${DEMO_PASSWORD}).`,
  );
}
