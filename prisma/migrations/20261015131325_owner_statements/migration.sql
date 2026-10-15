-- CreateEnum
CREATE TYPE "StatementStatus" AS ENUM ('DRAFT', 'ISSUED');

-- CreateTable
CREATE TABLE "OwnerStatement" (
    "id" TEXT NOT NULL,
    "ownerProfileId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "status" "StatementStatus" NOT NULL DEFAULT 'ISSUED',
    "openingBalanceXaf" INTEGER NOT NULL,
    "earningsXaf" INTEGER NOT NULL DEFAULT 0,
    "deductionsXaf" INTEGER NOT NULL DEFAULT 0,
    "refundsXaf" INTEGER NOT NULL DEFAULT 0,
    "expensesXaf" INTEGER NOT NULL DEFAULT 0,
    "payoutsXaf" INTEGER NOT NULL DEFAULT 0,
    "closingBalanceXaf" INTEGER NOT NULL,
    "lines" JSONB NOT NULL,
    "entryCount" INTEGER NOT NULL DEFAULT 0,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OwnerStatement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OwnerStatement_key_key" ON "OwnerStatement"("key");

-- CreateIndex
CREATE INDEX "OwnerStatement_periodStart_idx" ON "OwnerStatement"("periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "OwnerStatement_ownerProfileId_periodStart_key" ON "OwnerStatement"("ownerProfileId", "periodStart");

-- AddForeignKey
ALTER TABLE "OwnerStatement" ADD CONSTRAINT "OwnerStatement_ownerProfileId_fkey" FOREIGN KEY ("ownerProfileId") REFERENCES "OwnerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
