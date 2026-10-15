/**
 * Field-encryption key rotation (docs/SECURITY.md, OPEN_ITEMS #28).
 *
 * Procedure:
 *   1. Generate a new 32-byte key:  openssl rand -base64 32
 *   2. Set APP_ENCRYPTION_KEY=<new>, APP_ENCRYPTION_KEY_ID=v2,
 *      APP_ENCRYPTION_KEY_PREVIOUS=<old>, APP_ENCRYPTION_KEY_PREVIOUS_ID=v1 and redeploy
 *      (reads keep working with both keys; new writes use v2).
 *   3. Run `pnpm db:rotate-key` (idempotent, batched) until it reports 0 remaining rows.
 *   4. Remove the APP_ENCRYPTION_KEY_PREVIOUS* variables and redeploy.
 *
 * Lookup hashes (`*Hash` columns) are keyed with the active key as well; they are recomputed
 * from the decrypted value where the plaintext is available.
 */
/* eslint-disable no-console */
import "dotenv/config";

import { decryptField, hashForLookup, reencryptField } from "../src/lib/crypto";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const BATCH = 200;
const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

type Column = { enc: string; hash?: string };
type Row = Record<string, string | null>;
interface Delegate {
  findMany(args: unknown): Promise<Row[]>;
  update(args: unknown): Promise<unknown>;
  count(args: unknown): Promise<number>;
}
type Target = { model: string; columns: Column[] };

const TARGETS: Target[] = [
  {
    model: "customerProfile",
    columns: [
      { enc: "identityNumberEnc", hash: "identityNumberHash" },
      { enc: "drivingLicenceNoEnc", hash: "drivingLicenceNoHash" },
    ],
  },
  {
    model: "ownerProfile",
    columns: [
      { enc: "identityNumberEnc", hash: "identityNumberHash" },
      { enc: "taxIdentifierEnc" },
      { enc: "payoutBankAccountEnc" },
    ],
  },
  {
    model: "companyProfile",
    columns: [{ enc: "registrationNumberEnc" }, { enc: "taxpayerNumberEnc" }],
  },
  { model: "chauffeurProfile", columns: [{ enc: "licenceNumberEnc" }] },
  { model: "verificationDocument", columns: [{ enc: "documentNumberEnc" }] },
  { model: "vehicle", columns: [{ enc: "vinEnc" }] },
  { model: "vehicleDocument", columns: [{ enc: "documentNumberEnc" }] },
  { model: "trackerDevice", columns: [{ enc: "serialNumberEnc" }, { enc: "simNumberEnc" }] },
  { model: "paymentProviderConfig", columns: [{ enc: "credentialsEnc" }] },
];

const activeId = process.env.APP_ENCRYPTION_KEY_ID ?? "v1";

async function rotateModel(target: Target): Promise<{ updated: number; remaining: number }> {
  // Prisma's delegate API is accessed dynamically because the target list is data-driven.
  const delegate = (prisma as unknown as Record<string, Delegate>)[target.model]!;
  let updated = 0;
  let cursor: string | undefined;
  for (;;) {
    const rows = await delegate.findMany({
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      select: Object.fromEntries([["id", true], ...target.columns.map((c) => [c.enc, true])]),
    });
    if (rows.length === 0) break;
    for (const row of rows) {
      const data: Record<string, string> = {};
      for (const column of target.columns) {
        const value = row[column.enc];
        if (!value || value.startsWith(`${activeId}:`)) continue;
        const rotated = reencryptField(value);
        data[column.enc] = rotated;
        if (column.hash) {
          data[column.hash] = hashForLookup(decryptField(rotated));
        }
      }
      if (Object.keys(data).length > 0) {
        await delegate.update({ where: { id: row.id }, data });
        updated += 1;
      }
    }
    cursor = rows[rows.length - 1]!.id!;
  }
  const remaining = await delegate.count({
    where: {
      OR: target.columns.map((c) => ({
        AND: [{ [c.enc]: { not: null } }, { NOT: { [c.enc]: { startsWith: `${activeId}:` } } }],
      })),
    },
  });
  return { updated, remaining };
}

async function main() {
  if (!process.env.APP_ENCRYPTION_KEY_PREVIOUS) {
    console.log(
      "APP_ENCRYPTION_KEY_PREVIOUS is not set: only verifying that every row uses",
      activeId,
    );
  }
  let totalRemaining = 0;
  for (const target of TARGETS) {
    const result = await rotateModel(target);
    totalRemaining += result.remaining;
    console.log(`${target.model}: updated ${result.updated}, remaining ${result.remaining}`);
  }
  console.log(
    totalRemaining === 0 ? "Rotation complete." : `${totalRemaining} rows still on an old key.`,
  );
  process.exitCode = totalRemaining === 0 ? 0 : 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
