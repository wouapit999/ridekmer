-- CreateEnum
CREATE TYPE "PaymentProviderKey" AS ENUM ('MTN_MOMO', 'ORANGE_MONEY', 'CARD');

-- CreateTable
CREATE TABLE "PaymentProviderConfig" (
    "id" TEXT NOT NULL,
    "provider" "PaymentProviderKey" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "environment" TEXT NOT NULL DEFAULT 'mock',
    "baseUrl" TEXT,
    "cardProviderId" TEXT,
    "credentialsEnc" TEXT,
    "credentialFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastValidatedAt" TIMESTAMP(3),
    "lastValidationResult" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentProviderConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentProviderConfig_provider_key" ON "PaymentProviderConfig"("provider");

-- AddForeignKey
ALTER TABLE "PaymentProviderConfig" ADD CONSTRAINT "PaymentProviderConfig_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
