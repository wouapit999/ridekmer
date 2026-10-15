-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "additionalDrivers" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "cancellationFeeXaf" INTEGER,
ADD COLUMN     "cancelledById" TEXT,
ADD COLUMN     "extensionRequestedEndAt" TIMESTAMP(3),
ADD COLUMN     "paymentDueAt" TIMESTAMP(3),
ADD COLUMN     "promoCodeValue" TEXT;
