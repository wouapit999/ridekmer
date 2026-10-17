/* eslint-disable no-console */
import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { seedDemoData } from "./seed-data/demo";
import { demoSeedAllowed } from "./seed-data/guard";
import { seedReferenceData } from "./seed-data/reference";
import { seedShowcaseData } from "./seed-data/showcase";

const connectionString = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL (or DIRECT_DATABASE_URL) must be set to seed");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const isProduction = process.env.NODE_ENV === "production" || process.env.APP_ENV === "production";

async function main() {
  await seedReferenceData(prisma);
  if (demoSeedAllowed()) {
    console.log("Seeding SYNTHETIC demo data (ALLOW_DEMO_SEED=true, non-production)…");
    await seedDemoData(prisma);
    await seedShowcaseData(prisma);
  } else if (isProduction) {
    console.log(
      "Production environment detected: demo data skipped (never created in production).",
    );
  } else {
    console.log("Demo data skipped (set ALLOW_DEMO_SEED=true to create synthetic demo accounts).");
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log("Seed complete.");
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
