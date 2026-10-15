import type { PrismaClient } from "../../src/generated/prisma/client";
import { NOTIFICATION_TEMPLATES } from "@ridekmer/notifications";

import {
  ALL_PERMISSION_KEYS,
  PERMISSIONS,
  ROLE_DEFINITIONS,
} from "../../src/server/auth/permissions";
import { DOCUMENT_TYPE_SEED } from "./document-types";
import { SYSTEM_SETTINGS_SEED } from "./system-settings";

/* eslint-disable no-console */
export async function seedReferenceData(
  prisma: PrismaClient,
  log: (msg: string) => void = console.log,
) {
  log("Seeding permissions…");
  for (const key of ALL_PERMISSION_KEYS) {
    const def = PERMISSIONS[key];
    await prisma.permission.upsert({
      where: { key },
      update: { description: def.description, category: def.category },
      create: { key, description: def.description, category: def.category },
    });
  }

  log("Seeding roles…");
  for (const role of ROLE_DEFINITIONS) {
    const saved = await prisma.role.upsert({
      where: { key: role.key },
      update: {
        name: role.name,
        description: role.description,
        isStaff: role.isStaff,
        requiresMfa: role.requiresMfa,
      },
      create: {
        key: role.key,
        name: role.name,
        description: role.description,
        isStaff: role.isStaff,
        requiresMfa: role.requiresMfa,
      },
    });
    const keys = role.permissions === "*" ? ALL_PERMISSION_KEYS : role.permissions;
    const permissions = await prisma.permission.findMany({ where: { key: { in: keys } } });
    await prisma.rolePermission.deleteMany({
      where: { roleId: saved.id, permissionId: { notIn: permissions.map((p) => p.id) } },
    });
    for (const permission of permissions) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: saved.id, permissionId: permission.id } },
        update: {},
        create: { roleId: saved.id, permissionId: permission.id },
      });
    }
  }

  log("Seeding cities and branches…");
  const cities = [
    {
      slug: "douala",
      nameEn: "Douala",
      nameFr: "Douala",
      region: "Littoral",
      latitude: 4.0511,
      longitude: 9.7679,
      sortOrder: 1,
    },
    {
      slug: "yaounde",
      nameEn: "Yaoundé",
      nameFr: "Yaoundé",
      region: "Centre",
      latitude: 3.848,
      longitude: 11.5021,
      sortOrder: 2,
    },
  ];
  for (const city of cities) {
    const saved = await prisma.city.upsert({
      where: { slug: city.slug },
      update: city,
      create: city,
    });
    const branchSlug = `${city.slug}-central`;
    await prisma.branch.upsert({
      where: { slug: branchSlug },
      update: {},
      create: {
        cityId: saved.id,
        slug: branchSlug,
        nameEn: `${city.nameEn} central branch`,
        nameFr: `Agence centrale de ${city.nameFr}`,
        addressLine: `Agence RideKmer, ${city.nameFr} (adresse à confirmer)`,
        latitude: city.latitude,
        longitude: city.longitude,
        openingHours: { mon_fri: "08:00-18:00", sat: "09:00-15:00", sun: "closed" },
      },
    });
  }

  log("Seeding document types…");
  for (const [index, doc] of DOCUMENT_TYPE_SEED.entries()) {
    await prisma.documentType.upsert({
      where: { key: doc.key },
      update: { ...doc, sortOrder: index },
      create: { ...doc, sortOrder: index },
    });
  }

  log("Seeding system settings…");
  for (const setting of SYSTEM_SETTINGS_SEED) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      update: {
        descriptionEn: setting.descriptionEn,
        descriptionFr: setting.descriptionFr,
        category: setting.category,
        isPublic: setting.isPublic ?? false,
      },
      create: { ...setting, isPublic: setting.isPublic ?? false },
    });
  }

  log("Seeding notification templates…");
  for (const template of NOTIFICATION_TEMPLATES) {
    const locales = ["fr", "en"] as const;
    for (const locale of locales) {
      if (template.email) {
        await prisma.notificationTemplate.upsert({
          where: { key_channel_locale: { key: template.key, channel: "EMAIL", locale } },
          update: {},
          create: {
            key: template.key,
            channel: "EMAIL",
            locale,
            subject: template.email[locale].subject,
            body: template.email[locale].body,
            variables: template.variables,
          },
        });
      }
      if (template.sms) {
        await prisma.notificationTemplate.upsert({
          where: { key_channel_locale: { key: template.key, channel: "SMS", locale } },
          update: {},
          create: {
            key: template.key,
            channel: "SMS",
            locale,
            body: template.sms[locale],
            variables: template.variables,
          },
        });
      }
      if (template.inApp) {
        await prisma.notificationTemplate.upsert({
          where: { key_channel_locale: { key: template.key, channel: "IN_APP", locale } },
          update: {},
          create: {
            key: template.key,
            channel: "IN_APP",
            locale,
            subject: template.inApp[locale].title,
            body: template.inApp[locale].body,
            variables: template.variables,
          },
        });
      }
    }
  }

  log("Seeding ledger accounts…");
  const ledgerAccounts = [
    { key: "platform_cash", kind: "PLATFORM_CASH", name: "Platform cash (collected payments)" },
    {
      key: "customer_deposits_held",
      kind: "CUSTOMER_DEPOSITS_HELD",
      name: "Customer security deposits held",
    },
    { key: "platform_revenue", kind: "PLATFORM_REVENUE", name: "RideKmer commission revenue" },
    { key: "tax_payable", kind: "TAX_PAYABLE", name: "Taxes collected" },
    { key: "fees_receivable", kind: "FEES_RECEIVABLE", name: "Fees and additional charges" },
    { key: "adjustments", kind: "ADJUSTMENTS", name: "Manual adjustments" },
    { key: "payout_clearing", kind: "PAYOUT_CLEARING", name: "Payout clearing" },
  ] as const;
  for (const account of ledgerAccounts) {
    await prisma.ledgerAccount.upsert({ where: { key: account.key }, update: {}, create: account });
  }
}
