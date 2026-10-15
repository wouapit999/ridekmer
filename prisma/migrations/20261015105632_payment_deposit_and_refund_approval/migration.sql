-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "customerInstruction" TEXT,
ADD COLUMN     "depositXaf" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastCheckedAt" TIMESTAMP(3),
ADD COLUMN     "providerEnvironment" TEXT,
ADD COLUMN     "redirectUrl" TEXT;

-- AlterTable
ALTER TABLE "Refund" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" TEXT;
