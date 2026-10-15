import { logger } from "@/lib/logger";
import { recordAudit } from "@/server/audit";
import { db } from "@/server/db";
import { deleteStoredFile } from "@/server/files/service";
import { ownerBalance } from "@/features/finance/ledger";

import {
  anonymisedIdentity,
  BLOCKING_BOOKING_STATUSES,
  DEFAULT_DELETION_GRACE_DAYS,
  deletionDue,
} from "./privacy-rules";

/**
 * Data-subject rights (docs/PRIVACY.md, ADR-032):
 * - export: a JSON file of the personal data RideKmer holds about the user;
 * - deletion: request → grace period (cancellable) → anonymisation by the housekeeping job.
 *
 * Deletion is anonymisation, not physical deletion: bookings, payments, ledger entries,
 * contracts, inspections and audit rows are kept for statutory retention but no longer
 * identify the person (name, e-mail, phone, identity numbers and documents are removed).
 */
export class PrivacyError extends Error {
  constructor(readonly code: "ACTIVE_BOOKINGS" | "OUTSTANDING_BALANCE" | "STAFF" | "NOT_FOUND") {
    super(code);
    this.name = "PrivacyError";
  }
}

export {
  anonymisedIdentity,
  BLOCKING_BOOKING_STATUSES,
  DEFAULT_DELETION_GRACE_DAYS,
  deletionDue,
} from "./privacy-rules";

export async function deletionGraceDays(): Promise<number> {
  const setting = await db.systemSetting.findUnique({
    where: { key: "privacy.account_deletion_grace_days" },
  });
  const n = Number(setting?.value);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_DELETION_GRACE_DAYS;
}

/** Everything a user can see about their own data, as plain JSON (no encrypted fields). */
export async function buildDataExport(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      phoneNumber: true,
      preferredLocale: true,
      timezone: true,
      status: true,
      createdAt: true,
      lastLoginAt: true,
      userRoles: { select: { role: { select: { key: true } }, assignedAt: true } },
      customerProfile: {
        select: {
          firstName: true,
          lastName: true,
          dateOfBirth: true,
          nationality: true,
          drivingLicenceExpiry: true,
          drivingLicenceCategory: true,
          identityVerifiedAt: true,
          licenceVerifiedAt: true,
        },
      },
      ownerProfile: {
        select: {
          ownerType: true,
          displayName: true,
          payoutMethod: true,
          payoutBankName: true,
          payoutAccountName: true,
          kycApprovedAt: true,
          agreementAcceptedAt: true,
        },
      },
      addresses: { select: { label: true, line1: true, line2: true, neighbourhood: true } },
      notificationSettings: true,
      dataRequests: { select: { type: true, status: true, createdAt: true, processedAt: true } },
    },
  });
  if (!user) throw new PrivacyError("NOT_FOUND");
  const bookings = await db.booking.findMany({
    where: { customerId: userId },
    select: {
      reference: true,
      status: true,
      startAt: true,
      endAt: true,
      currencyCode: true,
      createdAt: true,
      vehicle: { select: { make: true, model: true, registrationNumber: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  const payments = await db.payment.findMany({
    where: { booking: { customerId: userId } },
    select: {
      id: true,
      method: true,
      status: true,
      amountXaf: true,
      createdAt: true,
      confirmedAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
  const contracts = await db.generatedContract.findMany({
    where: { booking: { customerId: userId } },
    select: { id: true, type: true, status: true, acceptedAt: true, createdAt: true },
  });
  const documents = await db.verificationDocument.findMany({
    where: { verificationCase: { customerProfile: { userId } } },
    select: { status: true, createdAt: true, documentType: { select: { key: true } } },
  });
  const notifications = await db.notification.findMany({
    where: { userId },
    select: { channel: true, templateKey: true, subject: true, status: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  const trackingAccess = await db.trackingAccessLog.count({ where: { userId } });
  return {
    exportedAt: new Date().toISOString(),
    notice:
      "Données personnelles détenues par RideKmer / Personal data held by RideKmer. Encrypted identifiers (identity numbers, licence numbers, bank accounts) are not included in this export; contact support to view them in person.",
    user: {
      ...user,
      userRoles: user.userRoles.map((r) => ({ role: r.role.key, since: r.assignedAt })),
    },
    bookings,
    payments,
    contracts,
    documents,
    notifications,
    trackingAccessLogEntries: trackingAccess,
  };
}

/** Customer-initiated: creates the DELETION request and freezes the account. */
export async function requestAccountDeletion(userId: string, reason?: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: { userRoles: { include: { role: true } } },
  });
  if (!user) throw new PrivacyError("NOT_FOUND");
  if (user.userRoles.some((r) => r.role.isStaff)) throw new PrivacyError("STAFF");
  await assertDeletable(userId);
  const existing = await db.dataRequest.findFirst({
    where: { userId, type: "DELETION", status: { in: ["REQUESTED", "IN_PROGRESS"] } },
  });
  if (existing) return existing;
  const request = await db.$transaction(async (tx) => {
    const created = await tx.dataRequest.create({
      data: { userId, type: "DELETION", status: "REQUESTED", reason: reason || null },
    });
    await tx.user.update({ where: { id: userId }, data: { status: "PENDING_DELETION" } });
    // Keep the current session so the person can cancel; other devices are signed out.
    return created;
  });
  await recordAudit({
    actorId: userId,
    action: "privacy.deletion.requested",
    entityType: "User",
    entityId: userId,
    reason: reason || null,
  });
  return request;
}

export async function cancelAccountDeletion(userId: string) {
  const open = await db.dataRequest.findFirst({
    where: { userId, type: "DELETION", status: { in: ["REQUESTED", "IN_PROGRESS"] } },
  });
  if (!open) return null;
  await db.$transaction([
    db.dataRequest.update({
      where: { id: open.id },
      data: { status: "REJECTED", processedAt: new Date(), processedBy: userId },
    }),
    db.user.update({ where: { id: userId }, data: { status: "ACTIVE" } }),
  ]);
  await recordAudit({
    actorId: userId,
    action: "privacy.deletion.cancelled",
    entityType: "User",
    entityId: userId,
  });
  return open;
}

export async function requestDataExport(userId: string) {
  const request = await db.dataRequest.create({
    data: { userId, type: "EXPORT", status: "COMPLETED", processedAt: new Date() },
  });
  await recordAudit({
    actorId: userId,
    action: "privacy.export.downloaded",
    entityType: "User",
    entityId: userId,
  });
  return request;
}

export async function openDeletionRequest(userId: string) {
  return db.dataRequest.findFirst({
    where: { userId, type: "DELETION", status: { in: ["REQUESTED", "IN_PROGRESS"] } },
  });
}

/** Refuses when the person still has bookings in flight or money owed either way. */
export async function assertDeletable(userId: string) {
  const activeBookings = await db.booking.count({
    where: { customerId: userId, status: { in: BLOCKING_BOOKING_STATUSES } },
  });
  if (activeBookings > 0) throw new PrivacyError("ACTIVE_BOOKINGS");
  const owner = await db.ownerProfile.findUnique({ where: { userId }, select: { id: true } });
  if (owner) {
    const balance = await ownerBalance(owner.id);
    if (balance.payableXaf !== 0 || balance.pendingPayoutsXaf !== 0)
      throw new PrivacyError("OUTSTANDING_BALANCE");
    const activeVehicles = await db.vehicle.count({
      where: { ownerProfileId: owner.id, status: { notIn: ["WITHDRAWN", "REJECTED", "DRAFT"] } },
    });
    if (activeVehicles > 0) throw new PrivacyError("ACTIVE_BOOKINGS");
  }
}

/**
 * Irreversible anonymisation. Called by housekeeping once the grace period has elapsed, or by
 * an administrator processing the request early. Never deletes financial or audit rows.
 */
export async function anonymiseUser(userId: string, actorId: string | null = null) {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: { customerProfile: true, ownerProfile: true, chauffeurProfile: true },
  });
  if (!user) throw new PrivacyError("NOT_FOUND");
  if (user.status === "DELETED") return { alreadyDeleted: true, filesDeleted: 0 };
  await assertDeletable(userId);

  // Identity documents: delete the stored files, then the rows.
  const documents = await db.verificationDocument.findMany({
    where: {
      OR: [
        { verificationCase: { customerProfile: { userId } } },
        { verificationCase: { ownerProfile: { userId } } },
      ],
    },
    select: { id: true, storageKey: true },
  });
  let filesDeleted = 0;
  for (const doc of documents) {
    try {
      await deleteStoredFile(doc.storageKey, actorId);
      filesDeleted += 1;
    } catch (error) {
      logger.warn("privacy.anonymise.file_delete_failed", { documentId: doc.id, error });
    }
  }

  const identity = anonymisedIdentity(userId);
  await db.$transaction(async (tx) => {
    await tx.verificationDocument.deleteMany({ where: { id: { in: documents.map((d) => d.id) } } });
    await tx.session.deleteMany({ where: { userId } });
    await tx.account.deleteMany({ where: { userId } });
    await tx.twoFactor.deleteMany({ where: { userId } });
    await tx.pushSubscription.deleteMany({ where: { userId } });
    await tx.address.deleteMany({ where: { userId } });
    await tx.notification.deleteMany({ where: { userId } });
    await tx.notificationPreference.deleteMany({ where: { userId } });
    if (user.customerProfile) {
      await tx.customerProfile.update({
        where: { userId },
        data: {
          firstName: "Supprimé",
          lastName: "Deleted",
          dateOfBirth: null,
          nationality: null,
          identityNumberEnc: null,
          identityNumberHash: null,
          drivingLicenceNoEnc: null,
          drivingLicenceNoHash: null,
          drivingLicenceExpiry: null,
          drivingLicenceCategory: null,
          notes: null,
        },
      });
    }
    if (user.ownerProfile) {
      await tx.ownerProfile.update({
        where: { userId },
        data: {
          displayName: identity.name,
          firstName: null,
          lastName: null,
          identityNumberEnc: null,
          identityNumberHash: null,
          taxIdentifierEnc: null,
          payoutMobileNumber: null,
          payoutBankName: null,
          payoutBankAccountEnc: null,
          payoutAccountName: null,
          notes: null,
        },
      });
    }
    if (user.chauffeurProfile) {
      await tx.chauffeurProfile.update({
        where: { userId },
        data: { licenceNumberEnc: null },
      });
    }
    await tx.user.update({
      where: { id: userId },
      data: {
        ...identity,
        image: null,
        emailVerified: false,
        phoneNumberVerified: false,
        twoFactorEnabled: false,
        status: "DELETED",
        deletedAt: new Date(),
      },
    });
    await tx.dataRequest.updateMany({
      where: { userId, type: "DELETION", status: { in: ["REQUESTED", "IN_PROGRESS"] } },
      data: { status: "COMPLETED", processedAt: new Date(), processedBy: actorId ?? "system" },
    });
  });
  await recordAudit({
    actorId,
    actorType: actorId ? "USER" : "CRON",
    action: "privacy.deletion.completed",
    entityType: "User",
    entityId: userId,
    after: { filesDeleted, documents: documents.length },
  });
  return { alreadyDeleted: false, filesDeleted };
}

/** Housekeeping: anonymise every deletion request whose grace period has elapsed. */
export async function processDueDeletions(now = new Date()) {
  const graceDays = await deletionGraceDays();
  const due = await db.dataRequest.findMany({
    where: { type: "DELETION", status: { in: ["REQUESTED", "IN_PROGRESS"] } },
    take: 50,
  });
  let completed = 0;
  let blocked = 0;
  for (const request of due) {
    if (!deletionDue(request.createdAt, graceDays, now)) continue;
    try {
      await anonymiseUser(request.userId, null);
      completed += 1;
    } catch (error) {
      blocked += 1;
      const code = error instanceof PrivacyError ? error.code : "ERROR";
      await db.dataRequest.update({
        where: { id: request.id },
        data: {
          status: "IN_PROGRESS",
          reason: `${request.reason ?? ""} [blocked: ${code}]`.trim(),
        },
      });
      logger.warn("privacy.deletion.blocked", { requestId: request.id, code });
    }
  }
  return { completed, blocked };
}

export async function listDataRequestsForAdmin() {
  return db.dataRequest.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { user: { select: { id: true, name: true, email: true, status: true } } },
  });
}
