-- Bookings awaiting identity verification also block the calendar (ADR-015/016).
-- Data safety: a pending-verification booking that already overlaps another blocking booking
-- is cancelled (with a recorded reason) before the stricter constraint is installed.
UPDATE "Booking" b
SET "status" = 'CANCELLED',
    "cancelledAt" = NOW(),
    "cancellationReason" = 'superseded by an overlapping booking (migration)',
    "updatedAt" = NOW()
WHERE b."status" = 'PENDING_VERIFICATION'
  AND EXISTS (
    SELECT 1 FROM "Booking" o
    WHERE o."id" <> b."id"
      AND o."vehicleId" = b."vehicleId"
      AND o."status" IN ('PENDING_VERIFICATION', 'PAYMENT_PENDING', 'CONFIRMED', 'READY_FOR_PICKUP', 'ACTIVE', 'EXTENSION_REQUESTED')
      AND tsrange(o."startAt", o."endAt", '[)') && tsrange(b."startAt", b."endAt", '[)')
      AND o."createdAt" <= b."createdAt"
  );

ALTER TABLE "Booking" DROP CONSTRAINT IF EXISTS "Booking_no_overlap_excl";
ALTER TABLE "Booking"
  ADD CONSTRAINT "Booking_no_overlap_excl"
  EXCLUDE USING gist (
    "vehicleId" WITH =,
    tsrange("startAt", "endAt", '[)') WITH &&
  )
  WHERE ("status" IN ('PENDING_VERIFICATION', 'PAYMENT_PENDING', 'CONFIRMED', 'READY_FOR_PICKUP', 'ACTIVE', 'EXTENSION_REQUESTED'));
