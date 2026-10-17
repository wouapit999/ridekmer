import { randomUUID } from "node:crypto";

import { addDays } from "date-fns";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createBooking } from "@/features/bookings/service";
import { saveProviderConfig } from "@/features/payments/provider-config";
import {
  confirmManualPayment,
  initiatePaymentForBooking,
  paymentTransactionId,
  refreshPaymentStatus,
} from "@/features/payments/service";
import { db } from "@/server/db";
import { listAvailableMethods, resetPaymentRegistry } from "@/server/payments/registry";

let vehicleId: string;
let customerId: string;
let financeId: string;
const base = addDays(new Date(), 90);
base.setUTCHours(8, 0, 0, 0);
let windowSeq = 0;

async function newPendingBooking() {
  windowSeq += 1;
  const startAt = addDays(base, windowSeq * 4);
  const { booking } = await createBooking({
    vehicleId,
    userId: customerId,
    window: { startAt, endAt: addDays(startAt, 2) },
    options: { chauffeur: true, delivery: false, returnPickup: false, additionalDrivers: 0 },
  });
  expect(booking.status).toBe("PAYMENT_PENDING");
  return booking;
}

beforeAll(async () => {
  const city = await db.city.findUniqueOrThrow({ where: { slug: "douala" } });
  const vehicle = await db.vehicle.create({
    data: {
      registrationNumber: `MM-${randomUUID().slice(0, 6).toUpperCase()}`,
      ownershipModel: "RIDEKMER_OWNED",
      cityId: city.id,
      make: "Manual",
      model: "Transfer",
      manufacturingYear: 2023,
      category: "SEDAN",
      transmission: "AUTOMATIC",
      fuelType: "PETROL",
      seats: 5,
      dailyPriceXaf: 30000,
      securityDepositXaf: 50000,
      status: "ACTIVE",
      documentsValid: true,
      publishedAt: new Date(),
      chauffeurAvailable: true,
      chauffeurDailyFeeXaf: 10000,
    },
  });
  vehicleId = vehicle.id;
  const [customer, finance] = await Promise.all([
    db.user.create({
      data: {
        email: `mm-cust-${randomUUID()}@ridekmer.test`,
        name: "Transfer Customer",
        phoneNumber: `+2376${String(Date.now()).slice(-8)}`,
      },
    }),
    db.user.create({ data: { email: `mm-fin-${randomUUID()}@ridekmer.test`, name: "Finance" } }),
  ]);
  customerId = customer.id;
  financeId = finance.id;
  // No MTN API yet: the registry falls back to the hand-made transfer.
  await saveProviderConfig({
    provider: "MTN_MOMO",
    enabled: false,
    environment: "mock",
    credentials: {},
    actorId: financeId,
  });
  resetPaymentRegistry();
});

afterAll(async () => {
  await db.paymentProviderConfig.deleteMany({ where: { provider: "MTN_MOMO" } });
  resetPaymentRegistry();
  await db.$disconnect();
});

describe("Mobile Money sent by hand while the operator API is not integrated", () => {
  it("offers MTN as a manual transfer to the company number", async () => {
    const mtn = (await listAvailableMethods()).find((m) => m.method === "MTN_MOBILE_MONEY");
    expect(mtn).toMatchObject({
      providerId: "manual-mtn-momo",
      environment: "production",
      customerSelectable: true,
      manual: true,
    });
  });

  it("records the transaction ID, waits for finance, and confirms the booking", async () => {
    const booking = await newPendingBooking();
    const input = {
      bookingId: booking.id,
      userId: customerId,
      method: "MTN_MOBILE_MONEY" as const,
      payerPhone: "677 12 34 56",
      locale: "en" as const,
    };
    await expect(initiatePaymentForBooking(input)).rejects.toMatchObject({
      code: "TRANSACTION_ID_REQUIRED",
    });
    await expect(
      initiatePaymentForBooking({ ...input, transactionId: "not an id!" }),
    ).rejects.toMatchObject({ code: "TRANSACTION_ID_INVALID" });

    const txId = `${Date.now()}`.slice(-10);
    const payment = await initiatePaymentForBooking({ ...input, transactionId: ` ${txId} ` });
    expect(payment.status).toBe("PENDING");
    expect(payment.provider).toBe("manual-mtn-momo");
    expect(paymentTransactionId(payment.metadata)).toBe(txId);
    expect(payment.metadata).toMatchObject({
      payTo: "+237677550803",
      accountName: "WOUAPIT MBAIMOUN NJI ROLAND",
    });
    expect(payment.customerInstruction).toContain("+237677550803");
    // A hand-made transfer gets hours, not the 15-minute Mobile Money approval window.
    expect(payment.expiresAt!.getTime() - Date.now()).toBeGreaterThan(20 * 3_600_000);
    // No "approve the request on your phone" SMS for a hand-made transfer.
    expect(
      await db.notification.count({
        where: { entityId: payment.id, templateKey: "payment_pending" },
      }),
    ).toBe(0);

    // The customer corrects a typo: the same payment is updated, not duplicated.
    const corrected = await initiatePaymentForBooking({
      ...input,
      transactionId: `MP240101.1234.${txId}`,
    });
    expect(corrected.id).toBe(payment.id);
    expect(paymentTransactionId(corrected.metadata)).toBe(`MP240101.1234.${txId}`);

    // Nothing to poll: the payment stays pending until finance confirms it.
    expect((await refreshPaymentStatus(payment.id)).status).toBe("PENDING");

    // The same transaction ID cannot pay a second booking.
    const other = await newPendingBooking();
    await expect(
      initiatePaymentForBooking({
        ...input,
        bookingId: other.id,
        transactionId: `mp240101.1234.${txId}`,
      }),
    ).rejects.toMatchObject({ code: "TRANSACTION_ID_USED" });

    const result = await confirmManualPayment({
      paymentId: payment.id,
      actorId: financeId,
      reference: `MP240101.1234.${txId}`,
      note: "Seen on the MTN account",
    });
    expect(result.confirmedBooking).toBe(true);
    const paid = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(paid.status).toBe("SUCCESSFUL");
    expect(paid.recordedById).toBe(financeId);
    // Confirmation keeps the customer's transaction ID next to the finance note.
    expect(paid.metadata).toMatchObject({
      transactionId: `MP240101.1234.${txId}`,
      note: "Seen on the MTN account",
    });
    expect((await db.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe(
      "CONFIRMED",
    );
  });
});
