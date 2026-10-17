/* eslint-disable no-console */
import { hashPassword } from "better-auth/crypto";

import type { PrismaClient } from "../../src/generated/prisma/client";
import {
  sampleVehicleData,
  SHOWCASE_VEHICLES,
  type ShowcaseVehicle,
} from "../../src/features/vehicles/showcase-data";
import { DEMO_PASSWORD } from "./demo";

/**
 * SHOWCASE demo data: the 10 sample listings (src/features/vehicles/showcase-data.ts), plus 3
 * owners, 4 customers and bookings at every stage, so the catalogue, the booking flow, the
 * owner space and the administration all have something to show. Every person, phone number
 * and plate is fictional ("(exemple)" names, `.test` e-mails, `EX-` plates). Photos are
 * served from /public/showcase. Non-production only: called behind ALLOW_DEMO_SEED.
 */

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

  const vehicles = new Map<string, { id: string; v: ShowcaseVehicle }>();
  for (const v of SHOWCASE_VEHICLES) {
    const city = cities.get(v.city);
    if (!city) throw new Error(`City ${v.city} missing`);
    const data = sampleVehicleData(
      v,
      {
        cityId: city.id,
        latitude: city.latitude,
        longitude: city.longitude,
        branchId: branches.get(city.id)?.id ?? null,
        ownCity: true,
        ownerProfileId: v.owner ? (ownerProfiles.get(v.owner) ?? null) : null,
      },
      new Date(now.getTime() - 45 * day),
    );
    const vehicle = await prisma.vehicle.upsert({
      where: { registrationNumber: v.plate },
      update: { ...data, deletedAt: null, publishedAt: undefined },
      create: data,
    });
    vehicles.set(v.plate, { id: vehicle.id, v });
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
