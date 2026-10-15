-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "depositSettledAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Inspection" ADD COLUMN     "damageXaf" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "deductionXaf" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "disputeNote" TEXT,
ADD COLUMN     "extraKmXaf" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "fuelXaf" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lateXaf" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "settlement" JSONB,
ADD COLUMN     "submittedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "MaintenanceRecord" ADD COLUMN     "availabilityBlockId" TEXT;
