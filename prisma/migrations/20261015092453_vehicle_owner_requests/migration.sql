-- CreateEnum
CREATE TYPE "VehicleOwnerRequestType" AS ENUM ('SUSPENSION', 'WITHDRAWAL');

-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "ownerRequestReason" TEXT,
ADD COLUMN     "ownerRequestType" "VehicleOwnerRequestType",
ADD COLUMN     "ownerRequestedAt" TIMESTAMP(3),
ADD COLUMN     "submittedAt" TIMESTAMP(3);
