import { addDays } from "date-fns";

import { formatIsoDate } from "@/lib/dates";
import { encryptField } from "@/lib/crypto";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/server/audit";
import { db } from "@/server/db";
import { storeFile, type StoredFile } from "@/server/files/service";
import { sendTemplatedNotification } from "@/server/notifications";
import { alertStaff } from "@/server/notifications/alerts";

import type { Prisma } from "@/generated/prisma/client";
import type { DocumentStatus } from "@/generated/prisma/enums";

import {
  alertThresholdDue,
  canTransition,
  evaluateVehicleCompliance,
  isExpired,
} from "./lifecycle";

export class DocumentError extends Error {
  constructor(
    public readonly code:
      | "TYPE_NOT_FOUND"
      | "INVALID_TRANSITION"
      | "NOT_FOUND"
      | "NUMBER_REQUIRED"
      | "EXPIRY_REQUIRED"
      | "EXPIRY_IN_PAST",
    message?: string,
  ) {
    super(message ?? code);
    this.name = "DocumentError";
  }
}

export interface DocumentMetadata {
  documentNumber?: string;
  issuer?: string;
  issueDate?: string; // yyyy-mm-dd
  expiryDate?: string; // yyyy-mm-dd
}

function parseDate(value?: string): Date | null {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function validateMetadata(typeKey: string, meta: DocumentMetadata) {
  const type = await db.documentType.findUnique({ where: { key: typeKey } });
  if (!type || !type.isActive) throw new DocumentError("TYPE_NOT_FOUND");
  if (type.requiresNumber && !meta.documentNumber?.trim())
    throw new DocumentError("NUMBER_REQUIRED");
  const expiryDate = parseDate(meta.expiryDate);
  if (type.requiresExpiry && !expiryDate) throw new DocumentError("EXPIRY_REQUIRED");
  if (expiryDate && expiryDate < new Date()) throw new DocumentError("EXPIRY_IN_PAST");
  return { type, expiryDate, issueDate: parseDate(meta.issueDate) };
}

/** Upload a new version of a vehicle document; the previous current version becomes REPLACED. */
export async function uploadVehicleDocument(input: {
  vehicleId: string;
  typeKey: string;
  file: File;
  meta: DocumentMetadata;
  actorId: string;
}) {
  const { type, expiryDate, issueDate } = await validateMetadata(input.typeKey, input.meta);
  const stored: StoredFile = await storeFile({
    scope: "vehicle-docs",
    entityId: input.vehicleId,
    file: input.file,
    allowedMimeTypes: type.allowedMimeTypes,
    maxSizeBytes: type.maxFileSizeBytes,
    actorId: input.actorId,
  });

  const previous = await db.vehicleDocument.findFirst({
    where: {
      vehicleId: input.vehicleId,
      documentTypeId: type.id,
      nextVersion: null,
      status: { notIn: ["REPLACED"] },
    },
    orderBy: { version: "desc" },
  });

  const document = await db.$transaction(async (tx) => {
    const created = await tx.vehicleDocument.create({
      data: {
        vehicleId: input.vehicleId,
        documentTypeId: type.id,
        status: "SUBMITTED",
        documentNumberEnc: input.meta.documentNumber
          ? encryptField(input.meta.documentNumber.trim())
          : null,
        issuer: input.meta.issuer?.trim() || null,
        issueDate,
        expiryDate,
        storageKey: stored.storageKey,
        fileName: stored.fileName,
        mimeType: stored.mimeType,
        fileSizeBytes: stored.fileSizeBytes,
        checksumSha256: stored.checksumSha256,
        version: (previous?.version ?? 0) + 1,
        previousVersionId: previous?.id ?? null,
      },
    });
    if (previous)
      await tx.vehicleDocument.update({ where: { id: previous.id }, data: { status: "REPLACED" } });
    return created;
  });

  await recordAudit({
    actorId: input.actorId,
    action: "vehicle_document.upload",
    entityType: "VehicleDocument",
    entityId: document.id,
    after: { vehicleId: input.vehicleId, type: type.key, version: document.version },
  });
  await recomputeVehicleCompliance(input.vehicleId, "document_uploaded");
  // Draft vehicles are reviewed as a whole on submission; later uploads (renewals) need a check.
  const vehicle = await db.vehicle.findUnique({
    where: { id: input.vehicleId },
    select: { status: true, make: true, model: true, registrationNumber: true },
  });
  if (vehicle && vehicle.status !== "DRAFT")
    await alertStaff("document.verify", {
      templateKey: "staff_document_review",
      variables: (locale) => ({
        document: locale === "en" ? type.nameEn : type.nameFr,
        subject: `${vehicle.make} ${vehicle.model} (${vehicle.registrationNumber})`,
      }),
      entityType: "VehicleDocument",
      entityId: document.id,
      dedupeKey: `document_uploaded:${document.id}`,
      exceptUserId: input.actorId,
    });
  return document;
}

/** Upload a KYC document into a verification case (customer identity, owner KYC, company KYB). */
export async function uploadVerificationDocument(input: {
  verificationCaseId: string;
  typeKey: string;
  file: File;
  meta: DocumentMetadata;
  actorId: string;
}) {
  const { type, expiryDate, issueDate } = await validateMetadata(input.typeKey, input.meta);
  const stored = await storeFile({
    scope: "kyc",
    entityId: input.verificationCaseId,
    file: input.file,
    allowedMimeTypes: type.allowedMimeTypes,
    maxSizeBytes: type.maxFileSizeBytes,
    actorId: input.actorId,
  });
  const previous = await db.verificationDocument.findFirst({
    where: {
      verificationCaseId: input.verificationCaseId,
      documentTypeId: type.id,
      nextVersion: null,
      status: { notIn: ["REPLACED"] },
    },
    orderBy: { version: "desc" },
  });
  const document = await db.$transaction(async (tx) => {
    const created = await tx.verificationDocument.create({
      data: {
        verificationCaseId: input.verificationCaseId,
        documentTypeId: type.id,
        status: "SUBMITTED",
        documentNumberEnc: input.meta.documentNumber
          ? encryptField(input.meta.documentNumber.trim())
          : null,
        issuer: input.meta.issuer?.trim() || null,
        issueDate,
        expiryDate,
        storageKey: stored.storageKey,
        fileName: stored.fileName,
        mimeType: stored.mimeType,
        fileSizeBytes: stored.fileSizeBytes,
        checksumSha256: stored.checksumSha256,
        version: (previous?.version ?? 0) + 1,
        previousVersionId: previous?.id ?? null,
      },
    });
    if (previous)
      await tx.verificationDocument.update({
        where: { id: previous.id },
        data: { status: "REPLACED" },
      });
    await tx.verificationCase.update({
      where: { id: input.verificationCaseId },
      data: { status: "SUBMITTED", submittedAt: new Date() },
    });
    return created;
  });
  await recordAudit({
    actorId: input.actorId,
    action: "verification_document.upload",
    entityType: "VerificationDocument",
    entityId: document.id,
    after: { caseId: input.verificationCaseId, type: type.key },
  });
  const uploader = await db.user.findUnique({
    where: { id: input.actorId },
    select: { name: true },
  });
  await alertStaff("document.verify", {
    templateKey: "staff_document_review",
    variables: (locale) => ({
      document: locale === "en" ? type.nameEn : type.nameFr,
      subject: uploader?.name ?? "",
    }),
    entityType: "VerificationCase",
    entityId: input.verificationCaseId,
    dedupeKey: `document_uploaded:${document.id}`,
    exceptUserId: input.actorId,
  });
  return document;
}

/** Reviewer decision on a vehicle document. */
export async function reviewVehicleDocument(input: {
  documentId: string;
  decision: "VERIFIED" | "REJECTED" | "UNDER_REVIEW";
  reason?: string;
  reviewerId: string;
}) {
  const doc = await db.vehicleDocument.findUnique({
    where: { id: input.documentId },
    include: {
      documentType: true,
      vehicle: { include: { ownerProfile: { include: { user: true } } } },
    },
  });
  if (!doc) throw new DocumentError("NOT_FOUND");
  if (!canTransition(doc.status, input.decision))
    throw new DocumentError("INVALID_TRANSITION", `${doc.status} → ${input.decision}`);
  const updated = await db.vehicleDocument.update({
    where: { id: doc.id },
    data: {
      status: input.decision,
      reviewerId: input.reviewerId,
      verifiedAt: input.decision === "VERIFIED" ? new Date() : null,
      rejectionReason: input.decision === "REJECTED" ? (input.reason ?? null) : null,
    },
  });
  await recordAudit({
    actorId: input.reviewerId,
    action: `vehicle_document.${input.decision.toLowerCase()}`,
    entityType: "VehicleDocument",
    entityId: doc.id,
    before: { status: doc.status },
    after: { status: input.decision },
    reason: input.reason,
  });
  if (input.decision === "REJECTED" && doc.vehicle.ownerProfile?.user.email) {
    const owner = doc.vehicle.ownerProfile.user;
    await sendTemplatedNotification({
      templateKey: "document_rejected",
      channel: "EMAIL",
      locale: owner.preferredLocale === "en" ? "en" : "fr",
      to: owner.email,
      userId: owner.id,
      variables: {
        name: owner.name,
        document:
          owner.preferredLocale === "en" ? doc.documentType.nameEn : doc.documentType.nameFr,
        reason: input.reason ?? "",
      },
      entityType: "VehicleDocument",
      entityId: doc.id,
    });
  }
  await recomputeVehicleCompliance(doc.vehicleId, "document_reviewed");
  return updated;
}

export async function reviewVerificationDocument(input: {
  documentId: string;
  decision: "VERIFIED" | "REJECTED";
  reason?: string;
  reviewerId: string;
}) {
  const doc = await db.verificationDocument.findUnique({ where: { id: input.documentId } });
  if (!doc) throw new DocumentError("NOT_FOUND");
  if (!canTransition(doc.status, input.decision)) throw new DocumentError("INVALID_TRANSITION");
  const updated = await db.verificationDocument.update({
    where: { id: doc.id },
    data: {
      status: input.decision,
      reviewerId: input.reviewerId,
      verifiedAt: input.decision === "VERIFIED" ? new Date() : null,
      rejectionReason: input.decision === "REJECTED" ? (input.reason ?? null) : null,
    },
  });
  await recordAudit({
    actorId: input.reviewerId,
    action: `verification_document.${input.decision.toLowerCase()}`,
    entityType: "VerificationDocument",
    entityId: doc.id,
    before: { status: doc.status },
    after: { status: input.decision },
    reason: input.reason,
  });
  return updated;
}

/**
 * Recompute `Vehicle.documentsValid` and switch between ACTIVE and UNAVAILABLE_DOCUMENTS.
 * Called after uploads, reviews, overrides and by the expiry cron.
 */
export async function recomputeVehicleCompliance(
  vehicleId: string,
  trigger: string,
  now = new Date(),
) {
  const vehicle = await db.vehicle.findUnique({
    where: { id: vehicleId },
    include: {
      documents: {
        where: { status: { in: ["VERIFIED", "EXPIRED"] } },
        include: { documentType: true },
      },
      documentOverrides: {
        where: { revokedAt: null, expiresAt: { gt: now } },
        orderBy: { expiresAt: "desc" },
        take: 1,
      },
    },
  });
  if (!vehicle) return null;
  const mandatoryTypes = await db.documentType.findMany({
    where: { subjectType: "VEHICLE", isMandatory: true, isActive: true },
    select: { key: true, blocksVehicleWhenExpired: true },
  });
  const result = evaluateVehicleCompliance(
    mandatoryTypes,
    vehicle.documents,
    now,
    vehicle.documentOverrides[0],
  );

  const data: Prisma.VehicleUpdateInput = { documentsValid: result.valid };
  if (!result.valid && vehicle.status === "ACTIVE") data.status = "UNAVAILABLE_DOCUMENTS";
  if (result.valid && vehicle.status === "UNAVAILABLE_DOCUMENTS") data.status = "ACTIVE";
  if (vehicle.documentsValid !== result.valid || data.status) {
    await db.vehicle.update({ where: { id: vehicleId }, data });
    await recordAudit({
      actorType: "SYSTEM",
      action: "vehicle.compliance.recompute",
      entityType: "Vehicle",
      entityId: vehicleId,
      before: { documentsValid: vehicle.documentsValid, status: vehicle.status },
      after: {
        documentsValid: result.valid,
        status: data.status ?? vehicle.status,
        trigger,
        missing: result.missing,
        expired: result.expired,
      },
    });
  }
  return result;
}

/** Administrator override of an expired-document block: requires a reason and an expiry; audited. */
export async function createDocumentOverride(input: {
  vehicleId: string;
  reason: string;
  days: number;
  actorId: string;
}) {
  const expiresAt = addDays(new Date(), Math.max(1, Math.min(input.days, 30)));
  const override = await db.documentOverride.create({
    data: {
      vehicleId: input.vehicleId,
      createdById: input.actorId,
      reason: input.reason,
      expiresAt,
    },
  });
  await recordAudit({
    actorId: input.actorId,
    action: "document_override.create",
    entityType: "DocumentOverride",
    entityId: override.id,
    after: { vehicleId: input.vehicleId, expiresAt: expiresAt.toISOString() },
    reason: input.reason,
  });
  await recomputeVehicleCompliance(input.vehicleId, "override_created");
  return override;
}

export async function revokeDocumentOverride(input: {
  overrideId: string;
  actorId: string;
  reason: string;
}) {
  const override = await db.documentOverride.update({
    where: { id: input.overrideId },
    data: { revokedAt: new Date(), revokedBy: input.actorId },
  });
  await recordAudit({
    actorId: input.actorId,
    action: "document_override.revoke",
    entityType: "DocumentOverride",
    entityId: override.id,
    reason: input.reason,
  });
  await recomputeVehicleCompliance(override.vehicleId, "override_revoked");
  return override;
}

/**
 * Daily job: send expiry alerts at configured thresholds, mark expired documents and
 * recompute vehicle availability. Idempotent: thresholds are recorded on the document and
 * notifications are deduplicated.
 */
export async function processDocumentExpiry(now = new Date()) {
  const horizon = addDays(now, 90);
  const candidates = await db.vehicleDocument.findMany({
    where: { status: "VERIFIED", expiryDate: { lte: horizon } },
    include: {
      documentType: true,
      vehicle: { include: { ownerProfile: { include: { user: true } } } },
    },
  });
  let alerts = 0;
  let expired = 0;
  const touchedVehicles = new Set<string>();

  for (const doc of candidates) {
    if (isExpired(doc, now)) {
      await db.vehicleDocument.update({
        where: { id: doc.id },
        data: { status: "EXPIRED" as DocumentStatus },
      });
      await recordAudit({
        actorType: "CRON",
        action: "vehicle_document.expired",
        entityType: "VehicleDocument",
        entityId: doc.id,
        after: { type: doc.documentType.key, vehicleId: doc.vehicleId },
      });
      touchedVehicles.add(doc.vehicleId);
      expired += 1;
      await notifyOwner(doc, 0, now);
      continue;
    }
    const threshold = alertThresholdDue(doc, now);
    if (threshold === null) continue;
    await db.vehicleDocument.update({
      where: { id: doc.id },
      data: { lastAlertDaysBefore: threshold },
    });
    await notifyOwner(doc, threshold, now);
    alerts += 1;
  }

  for (const vehicleId of touchedVehicles) {
    await recomputeVehicleCompliance(vehicleId, "document_expired", now);
  }
  const expiredOverrides = await db.documentOverride.findMany({
    where: { revokedAt: null, expiresAt: { lte: now } },
    select: { vehicleId: true },
  });
  for (const o of new Set(expiredOverrides.map((e) => e.vehicleId))) {
    await recomputeVehicleCompliance(o, "override_expired", now);
  }
  logger.info("cron.document_expiry", {
    candidates: candidates.length,
    alerts,
    expired,
    vehicles: touchedVehicles.size,
  });
  return {
    candidates: candidates.length,
    alerts,
    expired,
    vehiclesRecomputed: touchedVehicles.size,
  };
}

type ExpiryDoc = Prisma.VehicleDocumentGetPayload<{
  include: {
    documentType: true;
    vehicle: { include: { ownerProfile: { include: { user: true } } } };
  };
}>;

async function notifyOwner(doc: ExpiryDoc, days: number, now: Date) {
  const owner = doc.vehicle.ownerProfile?.user;
  if (!owner || !doc.expiryDate) return;
  const locale = owner.preferredLocale === "en" ? "en" : "fr";
  await sendTemplatedNotification({
    templateKey: "document_expiry",
    channel: "EMAIL",
    locale,
    to: owner.email,
    userId: owner.id,
    variables: {
      name: owner.name,
      document: locale === "en" ? doc.documentType.nameEn : doc.documentType.nameFr,
      vehicle: `${doc.vehicle.make} ${doc.vehicle.model} (${doc.vehicle.registrationNumber})`,
      days,
      date: formatIsoDate(doc.expiryDate),
    },
    entityType: "VehicleDocument",
    entityId: doc.id,
    dedupeKey: `document_expiry:${doc.id}:${days}:${formatIsoDate(now)}`,
  });
}
