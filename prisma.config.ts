import "dotenv/config";

import { defineConfig } from "prisma/config";

// The CLI (migrate, db push, studio) uses the DIRECT connection so that migrations never go
// through a transaction-mode pooler. The runtime client uses DATABASE_URL (see src/server/db).
const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? "";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: { url },
});
