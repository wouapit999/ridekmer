import { randomUUID } from "node:crypto";

import { addDays, startOfMonth } from "date-fns";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  cancelBookingByCustomer,
  createBooking,
  staffTransition,
} from "@/features/bookings/service";
import { decideExpense } from "@/features/finance/expenses";
import { accountBalance, ownerBalance, postMissingLedgerEntries } from "@/features/finance/ledger";
import {
  decidePayout,
  markPayoutPaid,
  processPayout,
  requestPayout,
} from "@/features/finance/payouts";
import { ownerPayableKey } from "@/features/finance/postings";
import { getFinanceDashboard, reportRows } from "@/features/finance/queries";
import { generateOwnerStatement } from "@/features/finance/statements";
import { settleReturnDeposit } from "@/features/inspections/deposit";
import {
  addDamage,
  addInspectionPhoto,
  saveInspectionDetails,
  startInspection,
  submitInspection,
} from "@/features/inspections/service";
import { createMaintenanceRecord, transitionMaintenance } from "@/features/maintenance/service";
import { decideRefund } from "@/features/payments/refunds";
import { initiatePaymentForBooking, simulateMockOutcome } from "@/features/payments/service";
import { encryptField } from "@/lib/crypto";
import { toCsv } from "@/lib/csv";
import { db } from "@/server/db";
import { setStorageProviderForTests } from "@/server/files/storage";
import { MemoryStorageProvider } from "@ridekmer/storage";

let vehicleId: string;
let ownerProfileId: string;
let ownerUserId: string;
let customerId: string;
let staffId: string;
let financeA: string;
let financeB: string;
const base = addDays(new Date(), 120);
base.setUTCHours(8, 0, 0, 0);
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);
const options = { chauffeur: true, delivery: false, returnPickup: false, additionalDrivers: 0 };

async function pay(bookingId: string) {
  const payment = await initiatePaymentForBooking({
    bookingId,
    userId: customerId,
    method: "MTN_MOBILE_MONEY",
    payerPhone: "+237677123456",
  });
  await simulateMockOutcome({ paymentId: payment.id, userId: customerId, outcome: "approve" });
  return payment;
}

beforeAll(async () => {
  setStorageProviderForTests(new MemoryStorageProvider());
  const city = await db.city.findUniqueOrThrow({ where: { slug: "douala" } });
  const owner = await db.user.create({
    data: { email: `fin-owner-${randomUUID()}@ridekmer.test`, name: "Finance Owner" },
  });
  ownerUserId = owner.id;
  const profile = await db.ownerProfile.create({
    data: {
      userId: owner.id,
      displayName: "Finance Owner",
      ownerType: "INDIVIDUAL",
      kycApprovedAt: new Date(),
      payoutMethod: "MTN_MOBILE_MONEY",
      payoutMobileNumber: "+237677999888",
    },
  });
  ownerProfileId = profile.id;
  const vehicle = await db.vehicle.create({
    data: {
      registrationNumber: `FI-${randomUUID().slice(0, 6).toUpperCase()}`,
      ownershipModel: "FULLY_MANAGED_OWNER_VEHICLE",
      ownerProfileId,
      cityId: city.id,
      make: "Finance",
      model: "Tester",
      manufacturingYear: 2022,
      category: "SEDAN",
      transmission: "AUTOMATIC",
      fuelType: "PETROL",
      seats: 5,
      dailyPriceXaf: 40000,
      securityDepositXaf: 100000,
      dailyKmAllowance: 100,
      extraKmRateXaf: 200,
      currentMileageKm: 1000,
      status: "ACTIVE",
      documentsValid: true,
      publishedAt: new Date(),
      chauffeurAvailable: true,
      chauffeurDailyFeeXaf: 10000,
    },
  });
  vehicleId = vehicle.id;
  const [c, s, fa, fb] = await Promise.all([
    db.user.create({
      data: {
        email: `fin-cust-${randomUUID()}@ridekmer.test`,
        name: "Finance Customer",
        phoneNumber: `+2376${String(Date.now()).slice(-8)}`,
      },
    }),
    db.user.create({
      data: { email: `fin-staff-${randomUUID()}@ridekmer.test`, name: "Finance Staff" },
    }),
    db.user.create({ data: { email: `fin-a-${randomUUID()}@ridekmer.test`, name: "Finance A" } }),
    db.user.create({ data: { email: `fin-b-${randomUUID()}@ridekmer.test`, name: "Finance B" } }),
  ]);
  customerId = c.id;
  staffId = s.id;
  financeA = fa.id;
  financeB = fb.id;
});

afterAll(async () => {
  setStorageProviderForTests(undefined);
  await db.$disconnect();
});

describe("ledger postings through the business flows", () => {
  let bookingId: string;
  let paymentId: string;

  it("posts a balanced set of entries when a payment succeeds and credits the owner", async () => {
    const { booking } = await createBooking({
      vehicleId,
      userId: customerId,
      window: { startAt: base, endAt: addDays(base, 2) },
      options,
    });
    bookingId = booking.id;
    const payment = await pay(bookingId);
    paymentId = payment.id;
    const entries = await db.ledgerEntry.findMany({ where: { paymentId } });
    expect(entries.length).toBeGreaterThanOrEqual(3);
    const snapshot = await db.bookingPriceSnapshot.findFirstOrThrow({ where: { bookingId } });
    expect(await accountBalance(ownerPayableKey(ownerProfileId))).toBe(snapshot.ownerShareXaf);
    expect(await accountBalance("customer_deposits_held")).toBeGreaterThanOrEqual(100000);
    // Idempotent: catch-up posts nothing new for this payment.
    const again = await postMissingLedgerEntries();
    expect(await db.ledgerEntry.count({ where: { paymentId } })).toBe(entries.length);
    expect(again.posted).toBeGreaterThanOrEqual(0);
    await expect(db.ledgerEntry.delete({ where: { id: entries[0]!.id } })).rejects.toThrow(
      /append-only/,
    );
  });

  it("posts the settlement retention and the deposit refund, leaving the owner with their share", async () => {
    const contract = await db.generatedContract.findFirstOrThrow({
      where: { bookingId, type: "CUSTOMER_RENTAL_AGREEMENT" },
    });
    await db.generatedContract.update({
      where: { id: contract.id },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
    });
    const pickup = await startInspection({
      vehicleId,
      bookingId,
      type: "PICKUP",
      inspectorId: staffId,
    });
    await saveInspectionDetails({
      inspectionId: pickup.id,
      actorId: staffId,
      mileageKm: 1000,
      fuelLevelPercent: 100,
      windscreenCondition: "ok",
      checks: {},
    });
    for (const a of ["front", "rear", "left", "right"])
      await addInspectionPhoto({
        inspectionId: pickup.id,
        actorId: staffId,
        file: new File([PNG], `${a}.png`, { type: "image/png" }),
        area: a,
      });
    await submitInspection(pickup.id, staffId);
    await staffTransition({ bookingId, to: "ACTIVE", actorId: staffId });
    const ret = await startInspection({
      vehicleId,
      bookingId,
      type: "RETURN",
      inspectorId: staffId,
    });
    await saveInspectionDetails({
      inspectionId: ret.id,
      actorId: staffId,
      mileageKm: 1200,
      fuelLevelPercent: 100,
      windscreenCondition: "ok",
      checks: {},
    });
    for (const a of ["front", "rear", "left", "right"])
      await addInspectionPhoto({
        inspectionId: ret.id,
        actorId: staffId,
        file: new File([PNG], `${a}.png`, { type: "image/png" }),
        area: a,
      });
    await addDamage({
      inspectionId: ret.id,
      actorId: staffId,
      diagramView: "top",
      markerX: 0.5,
      markerY: 0.5,
      area: "bonnet",
      damageType: "dent",
      severity: "MODERATE",
      isPreExisting: false,
      estimateXaf: 30000,
    });
    await submitInspection(ret.id, staffId); // deduction = 30 000 damage (200 km within allowance)
    await staffTransition({ bookingId, to: "COMPLETED", actorId: staffId });
    const ownerBefore = await accountBalance(ownerPayableKey(ownerProfileId));
    const result = await settleReturnDeposit(bookingId, financeA);
    expect(result.deductionXaf).toBe(30000);
    const retention = await db.ledgerEntry.findMany({
      where: { bookingId, idempotencyKey: { startsWith: "settlement:" } },
    });
    expect(retention.reduce((s, e) => s + e.amountXaf, 0)).toBe(30000);
    // Owner gets 80 % of the damage retention (commission 20 %).
    expect(await accountBalance(ownerPayableKey(ownerProfileId))).toBe(ownerBefore + 24000);

    const refund = result.refunds[0]!;
    await decideRefund({ refundId: refund.id, approverId: financeB, decision: "APPROVED" });
    const refundEntries = await db.ledgerEntry.findMany({ where: { refundId: refund.id } });
    expect(refundEntries.map((e) => e.type)).toEqual(["DEPOSIT_REFUND"]);
    expect(refundEntries[0]!.amountXaf).toBe(70000);
    expect(await accountBalance(ownerPayableKey(ownerProfileId))).toBe(ownerBefore + 24000);
  });

  it("debits the owner for an allocated maintenance expense", async () => {
    const record = await createMaintenanceRecord({
      vehicleId,
      type: "OIL_CHANGE",
      title: "Oil",
      quoteXaf: 20000,
      actorId: staffId,
    });
    await transitionMaintenance({
      recordId: record.id,
      to: "IN_PROGRESS",
      actorId: staffId,
      downtimeStart: addDays(base, 30),
      downtimeEnd: addDays(base, 31),
    });
    await transitionMaintenance({
      recordId: record.id,
      to: "COMPLETED",
      actorId: staffId,
      finalCostXaf: 20000,
    });
    const expense = await db.expense.findFirstOrThrow({
      where: { maintenanceRecordId: record.id },
    });
    expect(expense.status).toBe("PENDING");
    // The future downtime block was dropped on completion.
    expect(
      await db.vehicleAvailability.count({
        where: { vehicleId, type: "MAINTENANCE", startAt: addDays(base, 30) },
      }),
    ).toBe(0);
    const before = await accountBalance(ownerPayableKey(ownerProfileId));
    const allocated = await decideExpense({
      expenseId: expense.id,
      actorId: financeA,
      decision: "ALLOCATE",
      allocation: "SHARED",
      ownerShareXaf: 15000,
    });
    expect(allocated.status).toBe("ALLOCATED");
    expect(allocated.ridekmerShareXaf).toBe(5000);
    expect(await accountBalance(ownerPayableKey(ownerProfileId))).toBe(before - 15000);
  });

  it("refunds a cancelled paid booking proportionally between owner and platform", async () => {
    const { booking } = await createBooking({
      vehicleId,
      userId: customerId,
      window: { startAt: addDays(base, 40), endAt: addDays(base, 42) },
      options,
    });
    await pay(booking.id);
    const before = await accountBalance(ownerPayableKey(ownerProfileId));
    const snapshot = await db.bookingPriceSnapshot.findFirstOrThrow({
      where: { bookingId: booking.id },
    });
    await cancelBookingByCustomer(booking.id, customerId, "plans changed"); // free cancellation → full refund
    const refund = await db.refund.findFirstOrThrow({ where: { bookingId: booking.id } });
    await decideRefund({ refundId: refund.id, approverId: financeA, decision: "APPROVED" });
    await decideRefund({ refundId: refund.id, approverId: financeB, decision: "APPROVED" });
    expect(await accountBalance(ownerPayableKey(ownerProfileId))).toBe(
      before - snapshot.ownerShareXaf,
    );
    const sum = await db.ledgerEntry.aggregate({
      where: { refundId: refund.id },
      _sum: { amountXaf: true },
    });
    expect(sum._sum.amountXaf).toBe(refund.amountXaf);
  });
});

describe("payouts and statements", () => {
  it("requests, dual-approves, executes a mock Mobile Money payout and posts it", async () => {
    const balance = await ownerBalance(ownerProfileId);
    expect(balance.availableXaf).toBeGreaterThan(0);
    await expect(
      requestPayout({
        ownerProfileId,
        amountXaf: balance.availableXaf + 1,
        periodStart: base,
        periodEnd: addDays(base, 30),
        requestedById: financeA,
      }),
    ).rejects.toMatchObject({ code: "AMOUNT_INVALID" });
    await expect(
      requestPayout({
        ownerProfileId,
        amountXaf: 1000,
        periodStart: base,
        periodEnd: addDays(base, 30),
        requestedById: customerId,
        asOwner: true,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const payout = await requestPayout({
      ownerProfileId,
      amountXaf: balance.availableXaf,
      periodStart: base,
      periodEnd: addDays(base, 30),
      requestedById: ownerUserId,
      asOwner: true,
    });
    expect(payout.status).toBe("PENDING_APPROVAL");
    expect(payout.destinationMasked).toBe("+237 *** 888");
    expect((await ownerBalance(ownerProfileId)).availableXaf).toBe(0);
    await expect(processPayout(payout.id, financeA)).rejects.toMatchObject({
      code: "INVALID_STATUS",
    });
    const dual = payout.requiresDualApproval;
    const first = await decidePayout({
      payoutId: payout.id,
      approverId: financeA,
      decision: "APPROVED",
    });
    if (dual) {
      expect(first.status).toBe("PENDING_APPROVAL");
      await expect(
        decidePayout({ payoutId: payout.id, approverId: financeA, decision: "APPROVED" }),
      ).rejects.toMatchObject({ code: "ALREADY_DECIDED" });
      expect(
        (await decidePayout({ payoutId: payout.id, approverId: financeB, decision: "APPROVED" }))
          .status,
      ).toBe("APPROVED");
    } else {
      expect(first.status).toBe("APPROVED");
    }
    const paid = await processPayout(payout.id, financeB);
    expect(paid.status).toBe("PAID");
    expect(paid.providerReference).toMatch(/^po-/);
    expect(await db.ledgerEntry.count({ where: { payoutId: payout.id, type: "PAYOUT" } })).toBe(1);
    expect(await accountBalance(ownerPayableKey(ownerProfileId))).toBe(0);
  });

  it("keeps bank-transfer payouts manual until finance records the reference", async () => {
    await db.ownerProfile.update({
      where: { id: ownerProfileId },
      data: {
        payoutMethod: "BANK_TRANSFER",
        payoutBankName: "Afriland",
        payoutBankAccountEnc: encryptField("CM21000112345678901234"),
      },
    });
    const { booking } = await createBooking({
      vehicleId,
      userId: customerId,
      window: { startAt: addDays(base, 60), endAt: addDays(base, 61) },
      options,
    });
    await pay(booking.id);
    const available = (await ownerBalance(ownerProfileId)).availableXaf;
    const payout = await requestPayout({
      ownerProfileId,
      amountXaf: available,
      periodStart: addDays(base, 60),
      periodEnd: addDays(base, 61),
      requestedById: financeA,
    });
    expect(payout.destinationMasked).toBe("Afriland ***1234");
    await decidePayout({ payoutId: payout.id, approverId: financeB, decision: "APPROVED" });
    const processing = await processPayout(payout.id, financeB);
    expect(processing.status).toBe("PROCESSING");
    const paid = await markPayoutPaid(payout.id, "TRF-2026-0001", financeB);
    expect(paid.status).toBe("PAID");
    expect(await accountBalance(ownerPayableKey(ownerProfileId))).toBe(0);
  });

  it("issues a monthly statement whose closing balance matches the ledger and exports CSV safely", async () => {
    const statement = await generateOwnerStatement(
      ownerProfileId,
      startOfMonth(new Date()),
      financeA,
    );
    expect(statement.status).toBe("ISSUED");
    expect(statement.entryCount).toBeGreaterThan(0);
    expect(statement.closingBalanceXaf).toBe(await accountBalance(ownerPayableKey(ownerProfileId)));
    expect(statement.closingBalanceXaf).toBe(
      statement.openingBalanceXaf +
        statement.earningsXaf -
        statement.deductionsXaf -
        statement.refundsXaf -
        statement.expensesXaf -
        statement.payoutsXaf,
    );
    // Re-issuing an ISSUED statement returns the same frozen document.
    const again = await generateOwnerStatement(ownerProfileId, startOfMonth(new Date()), financeA);
    expect(again.id).toBe(statement.id);

    const dashboard = await getFinanceDashboard(new Date().toISOString().slice(0, 7));
    expect(dashboard.collectedXaf).toBeGreaterThan(0);
    expect(dashboard.ledgerCount).toBeGreaterThan(0);
    const rows = await reportRows("ledger", addDays(new Date(), -1), addDays(new Date(), 1));
    expect(rows.length).toBeGreaterThan(0);
    const csv = toCsv([{ a: "=SUM(A1)", b: 1 }]);
    expect(csv).toContain("'=SUM(A1)");
  });
});
