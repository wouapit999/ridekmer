import { randomUUID } from "node:crypto";

import { MockPaymentProvider } from "@ridekmer/payments";
import { addDays, addMinutes, subMinutes } from "date-fns";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { cancelBookingByCustomer, createBooking } from "@/features/bookings/service";
import { decideRefund, requestRefund } from "@/features/payments/refunds";
import {
  ingestPaymentWebhook,
  initiatePaymentForBooking,
  reconcilePayments,
  recordManualPayment,
  refreshPaymentStatus,
  simulateMockOutcome,
} from "@/features/payments/service";
import { db } from "@/server/db";
import { getPaymentProvider } from "@/server/payments/registry";

let vehicleId: string;
let customerId: string;
let financeA: string;
let financeB: string;
const base = addDays(new Date(), 60);
base.setUTCHours(8, 0, 0, 0);
const options = { chauffeur: true, delivery: false, returnPickup: false, additionalDrivers: 0 };
let windowSeq = 0;
function nextWindow() {
  windowSeq += 1;
  const startAt = addDays(base, windowSeq * 4);
  return { startAt, endAt: addDays(startAt, 2) };
}

async function newPendingBooking() {
  const { booking } = await createBooking({
    vehicleId,
    userId: customerId,
    window: nextWindow(),
    options,
  });
  expect(booking.status).toBe("PAYMENT_PENDING");
  return booking;
}

beforeAll(async () => {
  const city = await db.city.findUniqueOrThrow({ where: { slug: "douala" } });
  const vehicle = await db.vehicle.create({
    data: {
      registrationNumber: `PY-${randomUUID().slice(0, 6).toUpperCase()}`,
      ownershipModel: "RIDEKMER_OWNED",
      cityId: city.id,
      make: "Payment",
      model: "Tester",
      manufacturingYear: 2023,
      category: "SEDAN",
      transmission: "AUTOMATIC",
      fuelType: "PETROL",
      seats: 5,
      dailyPriceXaf: 40000,
      securityDepositXaf: 100000,
      status: "ACTIVE",
      documentsValid: true,
      publishedAt: new Date(),
      chauffeurAvailable: true,
      chauffeurDailyFeeXaf: 10000,
      dailyKmAllowance: 150,
    },
  });
  vehicleId = vehicle.id;
  const [c, fa, fb] = await Promise.all([
    db.user.create({
      data: {
        email: `pay-cust-${randomUUID()}@ridekmer.test`,
        name: "Paying Customer",
        phoneNumber: `+2376${String(Date.now()).slice(-8)}`,
      },
    }),
    db.user.create({ data: { email: `fin-a-${randomUUID()}@ridekmer.test`, name: "Finance A" } }),
    db.user.create({ data: { email: `fin-b-${randomUUID()}@ridekmer.test`, name: "Finance B" } }),
  ]);
  customerId = c.id;
  financeA = fa.id;
  financeB = fb.id;
});

afterAll(async () => {
  await db.$disconnect();
});

describe("mock Mobile Money payment through the webhook path", () => {
  it("initiates idempotently, confirms only after a signed webhook and verification", async () => {
    const booking = await newPendingBooking();
    const first = await initiatePaymentForBooking({
      bookingId: booking.id,
      userId: customerId,
      method: "MTN_MOBILE_MONEY",
      payerPhone: "677 12 34 56",
    });
    expect(first.status).toBe("REQUIRES_CUSTOMER_ACTION");
    expect(first.provider).toBe("mock-mtn-momo");
    expect(first.providerEnvironment).toBe("mock");
    expect(first.amountXaf).toBe(2 * 40000 + 2 * 10000 + 5000 + 100000); // rental + chauffeur + 5 % fee + deposit
    expect(first.depositXaf).toBe(100000);
    expect(first.payerPhoneMasked).toBe("+237 *** 456");

    // Re-entering the pay page reuses the open payment instead of creating a second request.
    const again = await initiatePaymentForBooking({
      bookingId: booking.id,
      userId: customerId,
      method: "MTN_MOBILE_MONEY",
      payerPhone: "+237677123456",
    });
    expect(again.id).toBe(first.id);

    // Polling before approval changes nothing.
    const polled = await refreshPaymentStatus(first.id);
    expect(polled.status).toBe("REQUIRES_CUSTOMER_ACTION");
    expect((await db.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe(
      "PAYMENT_PENDING",
    );

    // Approval via a signed mock webhook confirms the booking.
    const outcome = await simulateMockOutcome({
      paymentId: first.id,
      userId: customerId,
      outcome: "approve",
    });
    expect(outcome.result).toBe("PROCESSED");
    const paid = await db.payment.findUniqueOrThrow({ where: { id: first.id } });
    expect(paid.status).toBe("SUCCESSFUL");
    expect(paid.confirmedAt).not.toBeNull();
    const confirmed = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(confirmed.status).toBe("CONFIRMED");
    expect(
      await db.paymentWebhookEvent.count({ where: { paymentId: first.id, status: "PROCESSED" } }),
    ).toBe(1);

    await expect(
      initiatePaymentForBooking({
        bookingId: booking.id,
        userId: customerId,
        method: "ORANGE_MONEY",
        payerPhone: "+237699123456",
      }),
    ).rejects.toMatchObject({ code: "INVALID_STATUS" });
  });

  it("rejects replayed, forged, stale and mismatched webhooks", async () => {
    const booking = await newPendingBooking();
    const payment = await initiatePaymentForBooking({
      bookingId: booking.id,
      userId: customerId,
      method: "ORANGE_MONEY",
      payerPhone: "+237699123456",
    });
    const provider = (await getPaymentProvider("ORANGE_MONEY")) as MockPaymentProvider;
    const ref = payment.providerReference!;

    const forged = provider.buildWebhook(ref, "SUCCESSFUL", undefined, payment.amountXaf);
    forged.headers["x-mock-signature"] = "sha256=" + "0".repeat(64);
    const forgedOutcome = await ingestPaymentWebhook("orange-money", forged);
    expect(forgedOutcome).toMatchObject({ httpStatus: 401, result: "INVALID_SIGNATURE" });

    const stale = provider.buildWebhook(
      ref,
      "SUCCESSFUL",
      undefined,
      payment.amountXaf,
      subMinutes(new Date(), 30),
    );
    expect((await ingestPaymentWebhook("orange-money", stale)).result).toBe("REPLAY_REJECTED");

    // A success claiming a smaller amount than owed is verified against the amount and refused.
    const short = provider.buildWebhook(ref, "SUCCESSFUL", undefined, payment.amountXaf - 1);
    const shortOutcome = await ingestPaymentWebhook("orange-money", short);
    expect(shortOutcome.result).toBe("FAILED");
    expect(shortOutcome.detail).toBe("AMOUNT_MISMATCH");
    expect((await db.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe(
      "PAYMENT_PENDING",
    );

    const malformed = { headers: {}, rawBody: "{not json", receivedAt: new Date() };
    expect((await ingestPaymentWebhook("orange-money", malformed)).httpStatus).toBe(400);
    expect((await ingestPaymentWebhook("unknown", malformed)).httpStatus).toBe(404);

    const good = provider.buildWebhook(ref, "SUCCESSFUL", "evt-fixed-" + ref, payment.amountXaf);
    expect((await ingestPaymentWebhook("orange-money", good)).result).toBe("PROCESSED");
    const replay = await ingestPaymentWebhook("orange-money", good);
    expect(replay.result).toBe("REPLAY_REJECTED");
    expect((await db.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe(
      "CONFIRMED",
    );
    expect((await db.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe(
      "SUCCESSFUL",
    );
  });

  it("lets the customer retry after a decline with a fresh provider request", async () => {
    const booking = await newPendingBooking();
    const declined = await initiatePaymentForBooking({
      bookingId: booking.id,
      userId: customerId,
      method: "MTN_MOBILE_MONEY",
      payerPhone: "+237677000000",
    });
    const outcome = await simulateMockOutcome({
      paymentId: declined.id,
      userId: customerId,
      outcome: "decline",
    });
    expect(outcome.result).toBe("PROCESSED");
    expect((await db.payment.findUniqueOrThrow({ where: { id: declined.id } })).status).toBe(
      "FAILED",
    );
    const retry = await initiatePaymentForBooking({
      bookingId: booking.id,
      userId: customerId,
      method: "MTN_MOBILE_MONEY",
      payerPhone: "+237677123456",
    });
    expect(retry.id).not.toBe(declined.id);
    expect(retry.idempotencyKey).not.toBe(declined.idempotencyKey);
    expect(retry.status).toBe("REQUIRES_CUSTOMER_ACTION");
    await expect(
      simulateMockOutcome({ paymentId: retry.id, userId: financeA, outcome: "approve" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("validates Mobile Money numbers and refuses unavailable methods", async () => {
    const booking = await newPendingBooking();
    await expect(
      initiatePaymentForBooking({
        bookingId: booking.id,
        userId: customerId,
        method: "MTN_MOBILE_MONEY",
      }),
    ).rejects.toMatchObject({ code: "PHONE_REQUIRED" });
    await expect(
      initiatePaymentForBooking({
        bookingId: booking.id,
        userId: customerId,
        method: "MTN_MOBILE_MONEY",
        payerPhone: "+33612345678",
      }),
    ).rejects.toMatchObject({ code: "PHONE_INVALID" });
    await expect(
      initiatePaymentForBooking({ bookingId: booking.id, userId: customerId, method: "CASH" }),
    ).rejects.toMatchObject({ code: "METHOD_UNAVAILABLE" });
    await expect(
      initiatePaymentForBooking({ bookingId: booking.id, userId: financeA, method: "CARD" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("manual payments and reconciliation", () => {
  it("records a cash payment for the exact amount due and confirms the booking", async () => {
    const booking = await newPendingBooking();
    await expect(
      recordManualPayment({
        bookingId: booking.id,
        method: "CASH",
        amountXaf: 1000,
        reference: "RCPT-1",
        actorId: financeA,
      }),
    ).rejects.toMatchObject({ code: "AMOUNT_INVALID" });
    const payment = await recordManualPayment({
      bookingId: booking.id,
      method: "CASH",
      amountXaf: 205000,
      reference: "RCPT-0001",
      note: "paid at Akwa branch",
      actorId: financeA,
    });
    expect(payment.status).toBe("SUCCESSFUL");
    expect(payment.recordedById).toBe(financeA);
    expect((await db.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe(
      "CONFIRMED",
    );
    expect(
      await db.auditLog.count({ where: { entityId: payment.id, action: "payment.record_manual" } }),
    ).toBe(1);
  });

  it("extends the payment deadline for a bank transfer and expires stale requests", async () => {
    const booking = await newPendingBooking();
    const transfer = await initiatePaymentForBooking({
      bookingId: booking.id,
      userId: customerId,
      method: "BANK_TRANSFER",
      locale: "en",
    });
    expect(transfer.status).toBe("PENDING");
    expect(transfer.customerInstruction).toMatch(/Transfer to RideKmer/);
    const after = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(after.paymentDueAt!.getTime()).toBeGreaterThan(booking.paymentDueAt!.getTime());

    const other = await newPendingBooking();
    const momo = await initiatePaymentForBooking({
      bookingId: other.id,
      userId: customerId,
      method: "MTN_MOBILE_MONEY",
      payerPhone: "+237677123456",
    });
    await db.payment.update({
      where: { id: momo.id },
      data: { expiresAt: subMinutes(new Date(), 1) },
    });
    const result = await reconcilePayments(new Date());
    expect(result.expired).toBeGreaterThanOrEqual(1);
    expect((await db.payment.findUniqueOrThrow({ where: { id: momo.id } })).status).toBe("EXPIRED");
    expect((await db.payment.findUniqueOrThrow({ where: { id: transfer.id } })).status).toBe(
      "PENDING",
    );
  });

  it("reconciles settled payments and flags discrepancies", async () => {
    const booking = await newPendingBooking();
    const payment = await initiatePaymentForBooking({
      bookingId: booking.id,
      userId: customerId,
      method: "MTN_MOBILE_MONEY",
      payerPhone: "+237677123456",
    });
    await simulateMockOutcome({ paymentId: payment.id, userId: customerId, outcome: "approve" });
    const result = await reconcilePayments(addMinutes(new Date(), 1));
    expect(result.reconciled).toBeGreaterThanOrEqual(1);
    expect(
      (await db.payment.findUniqueOrThrow({ where: { id: payment.id } })).reconciledAt,
    ).not.toBeNull();
  });
});

describe("refunds with dual approval", () => {
  it("opens a refund when a paid booking is cancelled and requires two distinct approvers", async () => {
    const booking = await newPendingBooking();
    const payment = await initiatePaymentForBooking({
      bookingId: booking.id,
      userId: customerId,
      method: "MTN_MOBILE_MONEY",
      payerPhone: "+237677123456",
    });
    await simulateMockOutcome({ paymentId: payment.id, userId: customerId, outcome: "approve" });
    await cancelBookingByCustomer(booking.id, customerId, "change of plans");
    const refund = await db.refund.findFirstOrThrow({ where: { bookingId: booking.id } });
    expect(refund.status).toBe("PENDING_APPROVAL");
    expect(refund.amountXaf).toBe(payment.amountXaf); // free cancellation: full amount incl. deposit
    expect(refund.requiresDualApproval).toBe(true); // 215 000 ≥ 200 000 threshold
    expect(refund.requestedById).toBeNull();

    const once = await decideRefund({
      refundId: refund.id,
      approverId: financeA,
      decision: "APPROVED",
    });
    expect(once.status).toBe("PENDING_APPROVAL");
    await expect(
      decideRefund({ refundId: refund.id, approverId: financeA, decision: "APPROVED" }),
    ).rejects.toMatchObject({ code: "ALREADY_DECIDED" });
    const done = await decideRefund({
      refundId: refund.id,
      approverId: financeB,
      decision: "APPROVED",
    });
    expect(done.status).toBe("COMPLETED");
    const refunded = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(refunded.status).toBe("REFUNDED");
    expect(refunded.refundedXaf).toBe(payment.amountXaf);
  });

  it("refuses self-approval and over-refunding; small refunds need one approver", async () => {
    const booking = await newPendingBooking();
    const payment = await initiatePaymentForBooking({
      bookingId: booking.id,
      userId: customerId,
      method: "ORANGE_MONEY",
      payerPhone: "+237699123456",
    });
    await simulateMockOutcome({ paymentId: payment.id, userId: customerId, outcome: "approve" });
    await expect(
      requestRefund({
        paymentId: payment.id,
        amountXaf: payment.amountXaf + 1,
        reason: "x",
        requestedById: financeA,
      }),
    ).rejects.toMatchObject({ code: "AMOUNT_INVALID" });
    const small = await requestRefund({
      paymentId: payment.id,
      amountXaf: 50000,
      reason: "goodwill",
      requestedById: financeA,
    });
    expect(small.requiresDualApproval).toBe(false);
    await expect(
      decideRefund({ refundId: small.id, approverId: financeA, decision: "APPROVED" }),
    ).rejects.toMatchObject({ code: "SELF_APPROVAL" });
    const completed = await decideRefund({
      refundId: small.id,
      approverId: financeB,
      decision: "APPROVED",
    });
    expect(completed.status).toBe("COMPLETED");
    const p = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(p.status).toBe("PARTIALLY_REFUNDED");
    expect(p.refundedXaf).toBe(50000);
    const rejected = await requestRefund({
      paymentId: payment.id,
      amountXaf: 10000,
      reason: "second",
      requestedById: financeA,
    });
    const r = await decideRefund({
      refundId: rejected.id,
      approverId: financeB,
      decision: "REJECTED",
      comment: "no",
    });
    expect(r.status).toBe("REJECTED");
  });
});
