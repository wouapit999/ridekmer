/* eslint-disable no-console */
import { hashPassword } from "better-auth/crypto";

import type { PrismaClient } from "../../src/generated/prisma/client";

/**
 * SYNTHETIC demonstration data. Every name, phone number, plate and document number is
 * fictional. This function is only ever invoked outside production with ALLOW_DEMO_SEED=true.
 */
export const DEMO_PASSWORD = "RideKmer-Demo-2026!";

export const DEMO_ACCOUNTS = [
  {
    email: "demo.superadmin@ridekmer.test",
    name: "Demo Super Admin",
    roles: ["super_administrator"],
    phone: "+237600000001",
  },
  {
    email: "demo.admin@ridekmer.test",
    name: "Demo Administrator",
    roles: ["administrator"],
    phone: "+237600000002",
  },
  {
    email: "demo.ops@ridekmer.test",
    name: "Demo Operations Agent",
    roles: ["operations_agent"],
    phone: "+237600000003",
  },
  {
    email: "demo.inspector@ridekmer.test",
    name: "Demo Inspector",
    roles: ["vehicle_inspector"],
    phone: "+237600000004",
  },
  {
    email: "demo.finance@ridekmer.test",
    name: "Demo Finance Officer",
    roles: ["finance_officer"],
    phone: "+237600000005",
  },
  {
    email: "demo.fleet@ridekmer.test",
    name: "Demo Fleet Manager",
    roles: ["fleet_manager"],
    phone: "+237600000006",
  },
  {
    email: "demo.support@ridekmer.test",
    name: "Demo Support Agent",
    roles: ["support_agent"],
    phone: "+237600000007",
  },
  {
    email: "demo.owner@ridekmer.test",
    name: "Demo Vehicle Owner",
    roles: ["vehicle_owner", "customer"],
    phone: "+237600000008",
  },
  {
    email: "demo.customer@ridekmer.test",
    name: "Demo Customer",
    roles: ["customer"],
    phone: "+237600000009",
  },
  {
    email: "demo.chauffeur@ridekmer.test",
    name: "Demo Chauffeur",
    roles: ["chauffeur"],
    phone: "+237600000010",
  },
] as const;

const hasRole = (roles: readonly string[], key: string) => roles.includes(key);

export async function seedDemoData(prisma: PrismaClient) {
  if (process.env.NODE_ENV === "production" || process.env.APP_ENV === "production") {
    throw new Error("Demo data must never be seeded in production");
  }
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const roles = await prisma.role.findMany();
  const roleByKey = new Map(roles.map((r) => [r.key, r.id]));

  for (const account of DEMO_ACCOUNTS) {
    const user = await prisma.user.upsert({
      where: { email: account.email },
      update: { name: account.name },
      create: {
        email: account.email,
        name: account.name,
        emailVerified: true,
        phoneNumber: account.phone,
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
    for (const roleKey of account.roles) {
      const roleId = roleByKey.get(roleKey);
      if (!roleId) throw new Error(`Role ${roleKey} missing — run the reference seed first`);
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId } },
        update: {},
        create: { userId: user.id, roleId, assignedBy: "seed" },
      });
    }
    if (hasRole(account.roles, "customer")) {
      const [firstName, ...rest] = account.name.split(" ");
      await prisma.customerProfile.upsert({
        where: { userId: user.id },
        update: {},
        create: {
          userId: user.id,
          firstName: firstName ?? "Demo",
          lastName: rest.join(" ") || "User",
          nationality: "CM",
        },
      });
    }
    if (hasRole(account.roles, "vehicle_owner")) {
      await prisma.ownerProfile.upsert({
        where: { userId: user.id },
        update: {},
        create: {
          userId: user.id,
          ownerType: "INDIVIDUAL",
          displayName: account.name,
          onboardingStep: "vehicles",
        },
      });
    }
    if (hasRole(account.roles, "chauffeur")) {
      await prisma.chauffeurProfile.upsert({
        where: { userId: user.id },
        update: {},
        create: {
          userId: user.id,
          languages: ["fr", "en"],
          yearsOfExperience: 5,
          dailyFeeXaf: 15000,
        },
      });
    }
  }

  const douala = await prisma.city.findUniqueOrThrow({ where: { slug: "douala" } });
  const yaounde = await prisma.city.findUniqueOrThrow({ where: { slug: "yaounde" } });
  const doualaBranch = await prisma.branch.findUniqueOrThrow({ where: { slug: "douala-central" } });
  const owner = await prisma.ownerProfile.findFirstOrThrow({
    where: { user: { email: "demo.owner@ridekmer.test" } },
  });

  // Fictional registration numbers in the format "LT 000 XX" (synthetic, not real plates).
  const vehicles = [
    {
      registrationNumber: "LT-DEMO-001",
      make: "Toyota",
      model: "Corolla",
      manufacturingYear: 2021,
      category: "SEDAN",
      bodyType: "SEDAN",
      transmission: "AUTOMATIC",
      fuelType: "PETROL",
      seats: 5,
      doors: 4,
      dailyPriceXaf: 35000,
      weeklyPriceXaf: 220000,
      monthlyPriceXaf: 800000,
      securityDepositXaf: 150000,
      ownershipModel: "RIDEKMER_OWNED",
      cityId: douala.id,
      branchId: doualaBranch.id,
      ownerProfileId: null,
      descriptionFr: "Berline confortable et économique (véhicule de démonstration).",
      descriptionEn: "Comfortable, economical sedan (demonstration vehicle).",
    },
    {
      registrationNumber: "LT-DEMO-002",
      make: "Toyota",
      model: "RAV4",
      manufacturingYear: 2022,
      category: "SUV",
      bodyType: "SUV",
      transmission: "AUTOMATIC",
      fuelType: "PETROL",
      seats: 5,
      doors: 5,
      dailyPriceXaf: 55000,
      weeklyPriceXaf: 350000,
      monthlyPriceXaf: 1300000,
      securityDepositXaf: 250000,
      ownershipModel: "FULLY_MANAGED_OWNER_VEHICLE",
      cityId: douala.id,
      branchId: doualaBranch.id,
      ownerProfileId: owner.id,
      chauffeurAvailable: true,
      chauffeurDailyFeeXaf: 15000,
      descriptionFr: "SUV spacieux, idéal pour les routes de l'intérieur (démonstration).",
      descriptionEn: "Spacious SUV, ideal for upcountry roads (demonstration).",
    },
    {
      registrationNumber: "CE-DEMO-003",
      make: "Hyundai",
      model: "H1",
      manufacturingYear: 2020,
      category: "MINIBUS",
      bodyType: "MINIBUS",
      transmission: "MANUAL",
      fuelType: "DIESEL",
      seats: 9,
      doors: 4,
      dailyPriceXaf: 65000,
      weeklyPriceXaf: 420000,
      monthlyPriceXaf: 1500000,
      securityDepositXaf: 300000,
      ownershipModel: "SELF_MANAGED_MARKETPLACE_VEHICLE",
      cityId: yaounde.id,
      branchId: null,
      ownerProfileId: owner.id,
      chauffeurAvailable: true,
      chauffeurDailyFeeXaf: 20000,
      selfDriveAllowed: false,
      descriptionFr: "Minibus 9 places avec chauffeur (démonstration).",
      descriptionEn: "9-seat minibus with chauffeur (demonstration).",
    },
  ] as const;

  for (const v of vehicles) {
    await prisma.vehicle.upsert({
      where: { registrationNumber: v.registrationNumber },
      update: {},
      create: {
        ...v,
        status: "ACTIVE",
        documentsValid: true,
        publishedAt: new Date(),
        hasAirConditioning: true,
        hasBluetooth: true,
        hasUsbCharging: true,
        dailyKmAllowance: 200,
        extraKmRateXaf: 150,
        instantBooking: v.ownershipModel !== "SELF_MANAGED_MARKETPLACE_VEHICLE",
        existingDamageNotes: "Synthetic demo vehicle — no real condition data.",
        latitude: v.cityId === douala.id ? 4.0511 : 3.848,
        longitude: v.cityId === douala.id ? 9.7679 : 11.5021,
      },
    });
  }
  // Synthetic mock trackers: one commercial GPS per demo vehicle with a few fixes in the city.
  const fleetManager = await prisma.user.findUniqueOrThrow({
    where: { email: "demo.fleet@ridekmer.test" },
  });
  for (const [index, v] of vehicles.entries()) {
    const vehicle = await prisma.vehicle.findUniqueOrThrow({
      where: { registrationNumber: v.registrationNumber },
    });
    const externalDeviceId = `MOCK-DEMO-${String(index + 1).padStart(3, "0")}`;
    const device = await prisma.trackerDevice.upsert({
      where: { provider_externalDeviceId: { provider: "mock-gps", externalDeviceId } },
      update: {},
      create: {
        type: "COMMERCIAL_GPS",
        provider: "mock-gps",
        externalDeviceId,
        model: "MOCK-GPS-1",
        status: "ACTIVE",
        installedAt: new Date(),
        installedBy: fleetManager.id,
        installationNotes: "Synthetic demo tracker — no real device.",
        registeredById: fleetManager.id,
        lastSeenAt: new Date(),
        powerStatus: "EXTERNAL",
      },
    });
    const assigned = await prisma.vehicleTrackerAssignment.findFirst({
      where: { deviceId: device.id, unassignedAt: null },
    });
    if (!assigned) {
      await prisma.vehicleTrackerAssignment.create({
        data: {
          vehicleId: vehicle.id,
          deviceId: device.id,
          ownerConsentAt: v.ownershipModel === "RIDEKMER_OWNED" ? null : new Date(),
          consentNotes: v.ownershipModel === "RIDEKMER_OWNED" ? null : "Demo consent (synthetic)",
          assignedBy: fleetManager.id,
        },
      });
    }
    const fixes = await prisma.trackingEvent.count({ where: { deviceId: device.id } });
    if (fixes === 0) {
      const base = { latitude: vehicle.latitude ?? 4.0511, longitude: vehicle.longitude ?? 9.7679 };
      for (let i = 0; i < 6; i += 1) {
        await prisma.trackingEvent.create({
          data: {
            deviceId: device.id,
            vehicleId: vehicle.id,
            type: "LOCATION",
            recordedAt: new Date(Date.now() - (6 - i) * 10 * 60_000),
            latitude: base.latitude + i * 0.002,
            longitude: base.longitude + i * 0.0015,
            speedKmh: i === 5 ? 0 : 25,
            ignitionOn: i !== 5,
            powerStatus: "EXTERNAL",
            providerEventId: `demo-${externalDeviceId}-${i}`,
          },
        });
      }
    }
  }
  console.log(
    `Demo accounts created (password: ${DEMO_PASSWORD}) — SYNTHETIC DATA, non-production only.`,
  );
}
