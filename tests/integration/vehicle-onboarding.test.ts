import { randomUUID } from "node:crypto";

import { MemoryStorageProvider } from "@ridekmer/storage";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createDocumentOverride,
  processDocumentExpiry,
  reviewVehicleDocument,
  uploadVehicleDocument,
} from "@/features/documents/service";
import { acceptOwnerAgreement } from "@/features/owner/service";
import { basicsSchema } from "@/features/vehicles/schemas";
import {
  VehicleError,
  addVehicleImage,
  createVehicleDraft,
  reviewVehicle,
  submitVehicle,
  updateVehicleArrangement,
  updateVehiclePricing,
} from "@/features/vehicles/service";
import { assignRole } from "@/server/auth/rbac";
import { db } from "@/server/db";
import { setStorageProviderForTests } from "@/server/files/storage";

const JPEG = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
]);
const PDF = new TextEncoder().encode("%PDF-1.4\n%synthetic test document\n");
const file = (bytes: Uint8Array, type: string, name: string) =>
  new File(
    [bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer],
    name,
    { type },
  );
const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);

let ownerId: string;
let adminId: string;
let vehicleId: string;

beforeAll(async () => {
  setStorageProviderForTests(new MemoryStorageProvider());
  const owner = await db.user.create({
    data: {
      email: `owner-${randomUUID()}@ridekmer.test`,
      name: "Onboarding Owner",
      emailVerified: true,
    },
  });
  ownerId = owner.id;
  await db.ownerProfile.create({
    data: { userId: ownerId, ownerType: "INDIVIDUAL", displayName: "Onboarding Owner" },
  });
  await assignRole(ownerId, "vehicle_owner", "test");
  const admin = await db.user.create({
    data: {
      email: `admin-${randomUUID()}@ridekmer.test`,
      name: "Onboarding Admin",
      emailVerified: true,
    },
  });
  adminId = admin.id;
  await assignRole(adminId, "fleet_manager", "test");
});

afterAll(async () => {
  if (vehicleId) {
    await db.vehicleDocument.deleteMany({ where: { vehicleId } });
    await db.vehicle.delete({ where: { id: vehicleId } });
  }
  // Users with audit-log entries are never hard-deleted (append-only audit); the synthetic
  // test users stay in the test database.
  setStorageProviderForTests(undefined);
  await db.$disconnect();
});

describe("vehicle onboarding and approval", () => {
  it("creates a draft and refuses submission while incomplete", async () => {
    const city = await db.city.findUniqueOrThrow({ where: { slug: "douala" } });
    const vehicle = await createVehicleDraft(
      ownerId,
      basicsSchema.parse({
        registrationNumber: `ONB-${randomUUID().slice(0, 5).toUpperCase()}`,
        make: "Kia",
        model: "Picanto",
        manufacturingYear: 2022,
        category: "ECONOMY",
        bodyType: "HATCHBACK",
        transmission: "MANUAL",
        fuelType: "PETROL",
        seats: 4,
        currentMileageKm: 1000,
        cityId: city.id,
      }),
    );
    vehicleId = vehicle.id;
    expect(vehicle.status).toBe("DRAFT");
    await expect(submitVehicle(vehicleId, ownerId)).rejects.toMatchObject({ code: "INCOMPLETE" });
  });

  it("refuses a VIN that is already registered with a clear error", async () => {
    const city = await db.city.findUniqueOrThrow({ where: { slug: "douala" } });
    const vin = `VIN${randomUUID().replace(/-/g, "").slice(0, 14).toUpperCase()}`;
    const basics = (plate: string) =>
      basicsSchema.parse({
        registrationNumber: plate,
        vin,
        make: "Toyota",
        model: "Corolla",
        manufacturingYear: 2019,
        category: "SEDAN",
        bodyType: "SEDAN",
        transmission: "AUTOMATIC",
        fuelType: "PETROL",
        seats: 5,
        currentMileageKm: 1000,
        cityId: city.id,
      });
    const first = await createVehicleDraft(ownerId, basics(`VIN-${randomUUID().slice(0, 5)}`));
    try {
      await expect(
        createVehicleDraft(ownerId, basics(`VIN-${randomUUID().slice(0, 5)}`)),
      ).rejects.toMatchObject({ code: "DUPLICATE_VIN" });
    } finally {
      await db.vehicle.delete({ where: { id: first.id } });
    }
  });

  it("rejects access from a user who does not own the vehicle", async () => {
    await expect(
      updateVehiclePricing(vehicleId, adminId, {
        dailyPriceXaf: 20000,
        securityDepositXaf: 50000,
        selfDriveAllowed: true,
        chauffeurAvailable: false,
        instantBooking: false,
        minRentalDays: 1,
      }),
    ).rejects.toBeInstanceOf(VehicleError);
  });

  it("completes pricing, photo, documents, arrangement and agreement, then submits", async () => {
    await updateVehiclePricing(vehicleId, ownerId, {
      dailyPriceXaf: 20000,
      securityDepositXaf: 50000,
      selfDriveAllowed: true,
      chauffeurAvailable: false,
      instantBooking: true,
      minRentalDays: 1,
    });
    // Front first: the remaining views and one extra photo come after the first submit attempt.
    await addVehicleImage(vehicleId, ownerId, file(JPEG, "image/jpeg", "front.jpg"), "front");
    await updateVehicleArrangement(vehicleId, ownerId, {
      ownershipModel: "FULLY_MANAGED_OWNER_VEHICLE",
      ownerApprovesBookings: false,
      ownerHandlesHandover: false,
      ownerHandlesInspections: false,
      ownerHandlesCustomerContact: false,
      ownerHandlesMaintenance: false,
    });
    const mandatory = await db.documentType.findMany({
      where: {
        subjectType: "VEHICLE",
        isMandatory: true,
        key: { not: "vehicle_management_agreement" },
      },
    });
    for (const type of mandatory) {
      await uploadVehicleDocument({
        vehicleId,
        typeKey: type.key,
        file: file(PDF, "application/pdf", `${type.key}.pdf`),
        meta: {
          documentNumber: type.requiresNumber ? "SYN-123" : undefined,
          expiryDate: type.requiresExpiry ? inDays(200) : undefined,
        },
        actorId: ownerId,
      });
    }
    await acceptOwnerAgreement(ownerId, "fr", { ipAddress: "127.0.0.1", userAgent: "vitest" });

    // All four views (front, back, side, interior) are required before submitting.
    await expect(submitVehicle(vehicleId, ownerId)).rejects.toMatchObject({
      code: "INCOMPLETE",
      details: ["photos"],
    });
    await addVehicleImage(vehicleId, ownerId, file(JPEG, "image/jpeg", "extra.jpg"));
    for (const view of ["back", "side", "interior"] as const)
      await addVehicleImage(vehicleId, ownerId, file(JPEG, "image/jpeg", `${view}.jpg`), view);
    // Replacing a view keeps a single photo in that slot.
    const before = await db.vehicleImage.findFirstOrThrow({ where: { vehicleId, sortOrder: 0 } });
    await addVehicleImage(vehicleId, ownerId, file(JPEG, "image/jpeg", "front-2.jpg"), "front");
    const images = await db.vehicleImage.findMany({
      where: { vehicleId },
      orderBy: { sortOrder: "asc" },
    });
    expect(images.map((i) => i.sortOrder)).toEqual([0, 1, 2, 3, 4]);
    expect(images[0].id).not.toBe(before.id);
    expect(images.filter((i) => i.isPrimary).map((i) => i.sortOrder)).toEqual([0]);

    const submitted = await submitVehicle(vehicleId, ownerId);
    expect(submitted.status).toBe("SUBMITTED");
    const contract = await db.generatedContract.findFirst({
      where: {
        subjectId: (await db.ownerProfile.findUniqueOrThrow({ where: { userId: ownerId } })).id,
      },
      include: { signatures: true },
    });
    expect(contract?.signatures).toHaveLength(1);
    expect(contract?.checksumSha256).toHaveLength(64);
  });

  it("replaces a document version and keeps the previous one as REPLACED", async () => {
    const insurance = await db.documentType.findUniqueOrThrow({
      where: { key: "motor_insurance_certificate" },
    });
    const v2 = await uploadVehicleDocument({
      vehicleId,
      typeKey: insurance.key,
      file: file(PDF, "application/pdf", "insurance-v2.pdf"),
      meta: { documentNumber: "SYN-456", expiryDate: inDays(365) },
      actorId: ownerId,
    });
    expect(v2.version).toBe(2);
    const previous = await db.vehicleDocument.findUniqueOrThrow({
      where: { id: v2.previousVersionId! },
    });
    expect(previous.status).toBe("REPLACED");
  });

  it("refuses approval until every mandatory document is verified, then publishes", async () => {
    await expect(
      reviewVehicle({ vehicleId, decision: "APPROVED", actorId: adminId }),
    ).rejects.toMatchObject({ code: "INCOMPLETE" });
    const docs = await db.vehicleDocument.findMany({ where: { vehicleId, status: "SUBMITTED" } });
    for (const d of docs)
      await reviewVehicleDocument({ documentId: d.id, decision: "VERIFIED", reviewerId: adminId });
    const approved = await reviewVehicle({ vehicleId, decision: "APPROVED", actorId: adminId });
    expect(approved.status).toBe("ACTIVE");
    expect(approved.documentsValid).toBe(true);
    expect(approved.publishedAt).not.toBeNull();
    const audit = await db.auditLog.findFirst({
      where: { entityId: vehicleId, action: "vehicle.approved" },
    });
    expect(audit?.actorId).toBe(adminId);
  });

  it("makes the vehicle unavailable when a blocking document expires, and an override restores it", async () => {
    const insurance = await db.vehicleDocument.findFirstOrThrow({
      where: {
        vehicleId,
        status: "VERIFIED",
        documentType: { key: "motor_insurance_certificate" },
      },
    });
    await db.vehicleDocument.update({
      where: { id: insurance.id },
      data: { expiryDate: new Date(Date.now() - 3 * 86_400_000) },
    });
    const result = await processDocumentExpiry(new Date());
    expect(result.expired).toBeGreaterThanOrEqual(1);
    const blocked = await db.vehicle.findUniqueOrThrow({ where: { id: vehicleId } });
    expect(blocked.status).toBe("UNAVAILABLE_DOCUMENTS");
    expect(blocked.documentsValid).toBe(false);

    await createDocumentOverride({
      vehicleId,
      reason: "Renewal receipt seen in person",
      days: 3,
      actorId: adminId,
    });
    const restored = await db.vehicle.findUniqueOrThrow({ where: { id: vehicleId } });
    expect(restored.status).toBe("ACTIVE");
    const overrideAudit = await db.auditLog.findFirst({
      where: { action: "document_override.create", actorId: adminId },
    });
    expect(overrideAudit?.reason).toContain("Renewal");
  });

  it("sends expiry alerts once per threshold and records them on the document", async () => {
    const vignette = await db.vehicleDocument.findFirstOrThrow({
      where: { vehicleId, status: "VERIFIED", documentType: { key: "vehicle_tax_vignette" } },
    });
    await db.vehicleDocument.update({
      where: { id: vignette.id },
      data: { expiryDate: new Date(Date.now() + 10 * 86_400_000), lastAlertDaysBefore: null },
    });
    const first = await processDocumentExpiry(new Date());
    expect(first.alerts).toBeGreaterThanOrEqual(1);
    const after = await db.vehicleDocument.findUniqueOrThrow({ where: { id: vignette.id } });
    expect(after.lastAlertDaysBefore).toBe(14);
    const second = await processDocumentExpiry(new Date());
    const again = await db.vehicleDocument.findUniqueOrThrow({ where: { id: vignette.id } });
    expect(again.lastAlertDaysBefore).toBe(14);
    expect(second.alerts).toBeLessThanOrEqual(first.alerts);
  });
});
