-- CreateEnum
CREATE TYPE "ImmobilisationStatus" AS ENUM ('REQUESTED', 'STATIONARY_CONFIRMED', 'APPROVED', 'SENT_TO_PROVIDER', 'ACKNOWLEDGED', 'REJECTED', 'CANCELLED', 'UNAVAILABLE');

-- AlterTable
ALTER TABLE "TrackingEvent" ADD COLUMN     "geofenceId" TEXT,
ADD COLUMN     "insideGeofences" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "ImmobilisationRequest" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "bookingId" TEXT,
    "status" "ImmobilisationStatus" NOT NULL DEFAULT 'REQUESTED',
    "reason" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "stationaryConfirmedAt" TIMESTAMP(3),
    "stationaryConfirmedBy" TEXT,
    "lastSpeedKmh" DOUBLE PRECISION,
    "lastLocationAt" TIMESTAMP(3),
    "providerId" TEXT,
    "providerReference" TEXT,
    "providerMessage" TEXT,
    "executedAt" TIMESTAMP(3),
    "executedById" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImmobilisationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImmobilisationRequest_vehicleId_status_idx" ON "ImmobilisationRequest"("vehicleId", "status");

-- CreateIndex
CREATE INDEX "ImmobilisationRequest_status_createdAt_idx" ON "ImmobilisationRequest"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "ImmobilisationRequest" ADD CONSTRAINT "ImmobilisationRequest_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImmobilisationRequest" ADD CONSTRAINT "ImmobilisationRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
