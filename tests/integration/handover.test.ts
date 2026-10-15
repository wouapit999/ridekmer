import { randomUUID } from "node:crypto";

import { addDays, subDays } from "date-fns";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createBooking, staffTransition } from "@/features/bookings/service";
import { sendBookingReminders } from "@/features/bookings/reminders";
import { acceptContract, listContractsForBooking } from "@/features/contracts/service";
import { reportIncident, transitionIncident } from "@/features/incidents/service";
import { settleReturnDeposit } from "@/features/inspections/deposit";
import {
  addDamage,
  addInspectionPhoto,
  customerAcknowledgeInspection,
  saveInspectionDetails,
  startInspection,
  submitInspection,
} from "@/features/inspections/service";
import {
  createMaintenanceRecord,
  ownerDecideMaintenance,
  sendMaintenanceReminders,
  transitionMaintenance,
  upsertSchedule,
} from "@/features/maintenance/service";
import { initiatePaymentForBooking, simulateMockOutcome } from "@/features/payments/service";
import { db } from "@/server/db";
import { setStorageProviderForTests } from "@/server/files/storage";
import { MemoryStorageProvider } from "@ridekmer/storage";

let vehicleId: string;
let customerId: string;
let staffId: string;
let ownerUserId: string;
let bookingId: string;
const base = addDays(new Date(), 90);
base.setUTCHours(8, 0, 0, 0);

// 1x1 PNG
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);
function photo(name: string) {
  return new File([PNG], name, { type: "image/png" });
}

async function fourPhotos(inspectionId: string) {
  for (const area of ["front", "rear", "left", "right"]) {
    await addInspectionPhoto({ inspectionId, actorId: staffId, file: photo(`${area}.png`), area });
  }
}

beforeAll(async () => {
  setStorageProviderForTests(new MemoryStorageProvider());
  const city = await db.city.findUniqueOrThrow({ where: { slug: "douala" } });
  const owner = await db.user.create({
    data: { email: `own-${randomUUID()}@ridekmer.test`, name: "Owner H" },
  });
  ownerUserId = owner.id;
  const profile = await db.ownerProfile.create({
    data: {
      userId: owner.id,
      displayName: "Owner H",
      ownerType: "INDIVIDUAL",
      kycApprovedAt: new Date(),
    },
  });
  const vehicle = await db.vehicle.create({
    data: {
      registrationNumber: `HO-${randomUUID().slice(0, 6).toUpperCase()}`,
      ownershipModel: "FULLY_MANAGED_OWNER_VEHICLE",
      ownerProfileId: profile.id,
      cityId: city.id,
      make: "Handover",
      model: "Tester",
      manufacturingYear: 2022,
      category: "SUV",
      transmission: "AUTOMATIC",
      fuelType: "DIESEL",
      seats: 5,
      dailyPriceXaf: 50000,
      securityDepositXaf: 100000,
      dailyKmAllowance: 100,
      extraKmRateXaf: 200,
      currentMileageKm: 20000,
      status: "ACTIVE",
      documentsValid: true,
      publishedAt: new Date(),
      chauffeurAvailable: true,
      chauffeurDailyFeeXaf: 10000,
      managementConfig: { create: { ownerApprovesExpensesAboveXaf: 50000 } },
    },
  });
  vehicleId = vehicle.id;
  const [c, s] = await Promise.all([
    db.user.create({
      data: {
        email: `ho-cust-${randomUUID()}@ridekmer.test`,
        name: "Handover Customer",
        phoneNumber: `+2376${String(Date.now()).slice(-8)}`,
      },
    }),
    db.user.create({
      data: { email: `ho-staff-${randomUUID()}@ridekmer.test`, name: "Handover Staff" },
    }),
  ]);
  customerId = c.id;
  staffId = s.id;
  const { booking } = await createBooking({
    vehicleId,
    userId: customerId,
    window: { startAt: base, endAt: addDays(base, 2) },
    options: { chauffeur: true, delivery: false, returnPickup: false, additionalDrivers: 0 },
  });
  bookingId = booking.id;
  const payment = await initiatePaymentForBooking({
    bookingId,
    userId: customerId,
    method: "MTN_MOBILE_MONEY",
    payerPhone: "+237677123456",
  });
  await simulateMockOutcome({ paymentId: payment.id, userId: customerId, outcome: "approve" });
});

afterAll(async () => {
  setStorageProviderForTests(undefined);
  await db.$disconnect();
});

describe("contract, inspections and deposit settlement", () => {
  it("generates the rental agreement at confirmation and gates the handover on acceptance", async () => {
    const booking = await db.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(booking.status).toBe("CONFIRMED");
    const contracts = await listContractsForBooking(bookingId);
    const contract = contracts.find((c) => c.type === "CUSTOMER_RENTAL_AGREEMENT")!;
    expect(contract.status).toBe("SENT");
    expect(contract.renderedMarkdown).toContain(booking.reference);
    expect(contract.renderedMarkdown).not.toContain("{{");

    await expect(
      staffTransition({ bookingId, to: "ACTIVE", actorId: staffId }),
    ).rejects.toMatchObject({ code: "CONTRACT_NOT_ACCEPTED" });

    await expect(acceptContract(contract.id, staffId, {})).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    const accepted = await acceptContract(contract.id, customerId, {
      ipAddress: "127.0.0.1",
      userAgent: "vitest",
    });
    expect(accepted.status).toBe("ACCEPTED");
    const evidence = await db.signatureEvidence.findFirstOrThrow({
      where: { contractId: contract.id },
    });
    expect(evidence.method).toBe("CLICK_TO_ACCEPT");
    expect(evidence.contractChecksum).toBe(contract.checksumSha256);
    await expect(
      db.signatureEvidence.update({ where: { id: evidence.id }, data: { signatoryName: "x" } }),
    ).rejects.toThrow(/append-only/);
    await expect(acceptContract(contract.id, customerId, {})).rejects.toMatchObject({
      code: "ALREADY_ACCEPTED",
    });

    await expect(
      staffTransition({ bookingId, to: "ACTIVE", actorId: staffId }),
    ).rejects.toMatchObject({ code: "INSPECTION_REQUIRED" });
  });

  it("runs the pickup inspection with photos and pre-existing damage, then starts the rental", async () => {
    const inspection = await startInspection({
      vehicleId,
      bookingId,
      type: "PICKUP",
      inspectorId: staffId,
    });
    expect(inspection.status).toBe("DRAFT");
    const again = await startInspection({
      vehicleId,
      bookingId,
      type: "PICKUP",
      inspectorId: staffId,
    });
    expect(again.id).toBe(inspection.id);
    await expect(submitInspection(inspection.id, staffId)).rejects.toMatchObject({
      code: "DETAILS_REQUIRED",
    });
    await saveInspectionDetails({
      inspectionId: inspection.id,
      actorId: staffId,
      mileageKm: 20100,
      fuelLevelPercent: 100,
      windscreenCondition: "ok",
      checks: { exterior: { front: "ok", bogus: "ok" } },
    });
    await expect(submitInspection(inspection.id, staffId)).rejects.toMatchObject({
      code: "PHOTOS_REQUIRED",
    });
    await fourPhotos(inspection.id);
    await addDamage({
      inspectionId: inspection.id,
      actorId: staffId,
      diagramView: "top",
      markerX: 0.2,
      markerY: 0.1,
      area: "front_bumper",
      damageType: "scratch",
      severity: "MINOR",
      isPreExisting: false,
      estimateXaf: 20000,
    });
    const { inspection: submitted } = await submitInspection(inspection.id, staffId);
    expect(submitted.status).toBe("SUBMITTED");
    const damage = await db.vehicleDamage.findFirstOrThrow({
      where: { inspectionId: inspection.id },
    });
    expect(damage.isPreExisting).toBe(true); // pickup findings are always pre-existing
    expect(
      (await db.vehicle.findUniqueOrThrow({ where: { id: vehicleId } })).currentMileageKm,
    ).toBe(20100);
    expect(
      (await db.inspection.findUniqueOrThrow({ where: { id: inspection.id } })).exteriorCondition,
    ).toEqual({ front: "ok" });

    const active = await staffTransition({ bookingId, to: "ACTIVE", actorId: staffId });
    expect(active.status).toBe("ACTIVE");
  });

  it("computes the return settlement, lets the customer acknowledge, and releases the deposit", async () => {
    await expect(
      staffTransition({ bookingId, to: "COMPLETED", actorId: staffId }),
    ).rejects.toMatchObject({ code: "INSPECTION_REQUIRED" });
    const ret = await startInspection({
      vehicleId,
      bookingId,
      type: "RETURN",
      inspectorId: staffId,
    });
    await saveInspectionDetails({
      inspectionId: ret.id,
      actorId: staffId,
      mileageKm: 20450,
      fuelLevelPercent: 70,
      windscreenCondition: "ok",
      checks: {},
    });
    await fourPhotos(ret.id);
    await addDamage({
      inspectionId: ret.id,
      actorId: staffId,
      diagramView: "top",
      markerX: 0.8,
      markerY: 0.9,
      area: "rear_bumper",
      damageType: "dent",
      severity: "MODERATE",
      isPreExisting: false,
      estimateXaf: 30000,
    });
    await addDamage({
      inspectionId: ret.id,
      actorId: staffId,
      diagramView: "top",
      markerX: 0.2,
      markerY: 0.1,
      area: "front_bumper",
      damageType: "scratch",
      severity: "MINOR",
      isPreExisting: true,
      estimateXaf: 20000,
    });
    const { settlement } = await submitInspection(ret.id, staffId);
    expect(settlement).not.toBeNull();
    // 350 km driven − 200 allowance = 150 × 200 = 30 000; fuel 30 % × 0 (no fuel setting seeded) ; damage 30 000
    expect(settlement!.extraKmXaf).toBe(30000);
    expect(settlement!.damageXaf).toBe(30000);
    expect(settlement!.lateXaf).toBe(0);
    expect(settlement!.deductionXaf).toBe(60000 + settlement!.fuelXaf);
    expect(settlement!.depositRefundXaf).toBe(100000 - settlement!.deductionXaf);

    await expect(
      customerAcknowledgeInspection({
        inspectionId: ret.id,
        userId: staffId,
        decision: "ACKNOWLEDGE",
        evidence: {},
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const ack = await customerAcknowledgeInspection({
      inspectionId: ret.id,
      userId: customerId,
      decision: "ACKNOWLEDGE",
      evidence: { ipAddress: "127.0.0.1" },
    });
    expect(ack.status).toBe("ACKNOWLEDGED");

    await expect(settleReturnDeposit(bookingId, staffId)).rejects.toMatchObject({
      code: "BOOKING_STATUS",
    });
    const completed = await staffTransition({ bookingId, to: "COMPLETED", actorId: staffId });
    expect(completed.status).toBe("COMPLETED");
    const result = await settleReturnDeposit(bookingId, staffId);
    expect(result.refundXaf).toBe(settlement!.depositRefundXaf);
    expect(result.additionalChargeXaf).toBe(0);
    expect(result.refunds).toHaveLength(1);
    expect(result.refunds[0]!.status).toBe("PENDING_APPROVAL");
    await expect(settleReturnDeposit(bookingId, staffId)).rejects.toMatchObject({
      code: "ALREADY_SETTLED",
    });
  });
});

describe("incidents", () => {
  it("lets the customer report on their booking, moves through statuses and notifies", async () => {
    const other = await db.user.create({
      data: { email: `ho-other-${randomUUID()}@ridekmer.test`, name: "Other" },
    });
    await expect(
      reportIncident({
        vehicleId,
        bookingId,
        type: "DAMAGE",
        occurredAt: new Date(),
        description: "Scratched in a car park",
        reporterId: other.id,
        asCustomer: true,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const incident = await reportIncident({
      vehicleId,
      bookingId,
      type: "DAMAGE",
      occurredAt: subDays(new Date(), 1),
      description: "Scratched in a car park, photos attached",
      reporterId: customerId,
      asCustomer: true,
      photos: [photo("scratch.png")],
    });
    expect(incident.reference.startsWith("IN-")).toBe(true);
    expect(
      (await db.incident.findUniqueOrThrow({ where: { id: incident.id } })).photoKeys,
    ).toHaveLength(1);
    await expect(
      transitionIncident({ incidentId: incident.id, to: "RESOLVED", actorId: staffId }),
    ).rejects.toMatchObject({ code: "INVALID_STATUS" });
    await transitionIncident({
      incidentId: incident.id,
      to: "UNDER_REVIEW",
      actorId: staffId,
      note: "checking photos",
    });
    const closed = await transitionIncident({
      incidentId: incident.id,
      to: "CLOSED",
      actorId: staffId,
    });
    expect(closed.status).toBe("CLOSED");
    expect(await db.incidentStatusHistory.count({ where: { incidentId: incident.id } })).toBe(3);
    expect(
      await db.notification.count({ where: { entityType: "Incident", entityId: incident.id } }),
    ).toBeGreaterThanOrEqual(2);
  });

  it("blocks the vehicle when staff ask for it and releases the block on close", async () => {
    const incident = await reportIncident({
      vehicleId,
      type: "BREAKDOWN",
      occurredAt: new Date(),
      description: "Engine warning light on, towed",
      reporterId: staffId,
      blockVehicle: true,
    });
    const block = await db.vehicleAvailability.findFirstOrThrow({
      where: { vehicleId, type: "INCIDENT", reason: `incident ${incident.reference}` },
    });
    expect(block.endAt.getTime()).toBeGreaterThan(Date.now());
    await transitionIncident({ incidentId: incident.id, to: "CLOSED", actorId: staffId });
    const released = await db.vehicleAvailability.findUniqueOrThrow({ where: { id: block.id } });
    expect(released.endAt.getTime()).toBeLessThanOrEqual(Date.now());
  });
});

describe("maintenance", () => {
  it("routes quotes above the owner threshold for approval, blocks the vehicle while in progress and rolls the schedule", async () => {
    const schedule = await upsertSchedule({
      vehicleId,
      type: "OIL_CHANGE",
      intervalKm: 5000,
      nextDueKm: 20500,
      actorId: staffId,
    });
    const record = await createMaintenanceRecord({
      vehicleId,
      type: "OIL_CHANGE",
      title: "Oil change 20k",
      quoteXaf: 80000,
      actorId: staffId,
    });
    expect(record.status).toBe("AWAITING_OWNER_APPROVAL");
    await expect(
      transitionMaintenance({ recordId: record.id, to: "IN_PROGRESS", actorId: staffId }),
    ).rejects.toMatchObject({ code: "INVALID_STATUS" });
    await expect(
      ownerDecideMaintenance({ recordId: record.id, ownerUserId: customerId, approve: true }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const approved = await ownerDecideMaintenance({
      recordId: record.id,
      ownerUserId: ownerUserId,
      approve: true,
    });
    expect(approved.status).toBe("APPROVED");

    const started = await transitionMaintenance({
      recordId: record.id,
      to: "IN_PROGRESS",
      actorId: staffId,
    });
    expect(started.availabilityBlockId).not.toBeNull();
    const block = await db.vehicleAvailability.findUniqueOrThrow({
      where: { id: started.availabilityBlockId! },
    });
    expect(block.type).toBe("MAINTENANCE");

    const reminders = await sendMaintenanceReminders(new Date());
    expect(reminders.due).toBeGreaterThanOrEqual(1); // 20450 km ≥ 20500 − 500

    const done = await transitionMaintenance({
      recordId: record.id,
      to: "COMPLETED",
      actorId: staffId,
      finalCostXaf: 75000,
      mileageKm: 20500,
    });
    expect(done.status).toBe("COMPLETED");
    const releasedBlock = await db.vehicleAvailability.findUniqueOrThrow({
      where: { id: block.id },
    });
    expect(releasedBlock.endAt.getTime()).toBeLessThanOrEqual(Date.now());
    const expense = await db.expense.findFirstOrThrow({
      where: { maintenanceRecordId: record.id },
    });
    expect(expense.amountXaf).toBe(75000);
    expect(expense.allocation).toBe("OWNER");
    const rolled = await db.maintenanceSchedule.findUniqueOrThrow({ where: { id: schedule.id } });
    expect(rolled.nextDueKm).toBe(25500);
    expect(rolled.lastDoneKm).toBe(20500);
  });

  it("refuses to start downtime over a confirmed booking", async () => {
    const { booking } = await createBooking({
      vehicleId,
      userId: customerId,
      window: { startAt: addDays(base, 10), endAt: addDays(base, 12) },
      options: { chauffeur: true, delivery: false, returnPickup: false, additionalDrivers: 0 },
    });
    await db.booking.update({ where: { id: booking.id }, data: { status: "CONFIRMED" } });
    const record = await createMaintenanceRecord({
      vehicleId,
      type: "REPAIR",
      title: "Brake pads",
      quoteXaf: 10000,
      actorId: staffId,
    });
    expect(record.status).toBe("SCHEDULED");
    await expect(
      transitionMaintenance({
        recordId: record.id,
        to: "IN_PROGRESS",
        actorId: staffId,
        downtimeStart: addDays(base, 9),
        downtimeEnd: addDays(base, 13),
      }),
    ).rejects.toMatchObject({ code: "BOOKING_CONFLICT" });
  });
});

describe("booking reminders", () => {
  it("sends pickup, return and late-return notifications once", async () => {
    const soon = await createBooking({
      vehicleId,
      userId: customerId,
      window: { startAt: addDays(new Date(), 1), endAt: addDays(new Date(), 3) },
      options: { chauffeur: true, delivery: false, returnPickup: false, additionalDrivers: 0 },
    });
    await db.booking.update({
      where: { id: soon.booking.id },
      data: { status: "CONFIRMED", startAt: new Date(Date.now() + 12 * 3600_000) },
    });
    const lateBooking = await createBooking({
      vehicleId,
      userId: customerId,
      window: { startAt: addDays(base, 20), endAt: addDays(base, 22) },
      options: { chauffeur: true, delivery: false, returnPickup: false, additionalDrivers: 0 },
    });
    await db.booking.update({
      where: { id: lateBooking.booking.id },
      data: {
        status: "ACTIVE",
        startAt: new Date(Date.now() - 48 * 3600_000),
        endAt: new Date(Date.now() - 3 * 3600_000),
      },
    });
    const first = await sendBookingReminders(new Date());
    expect(first.pickups).toBeGreaterThanOrEqual(1);
    expect(first.late).toBeGreaterThanOrEqual(1);
    expect(
      await db.notification.count({ where: { dedupeKey: `upcoming_pickup:${soon.booking.id}` } }),
    ).toBe(1);
    await sendBookingReminders(new Date());
    expect(
      await db.notification.count({ where: { dedupeKey: `upcoming_pickup:${soon.booking.id}` } }),
    ).toBe(1);
  });
});
