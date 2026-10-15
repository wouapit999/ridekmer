import { encryptField, hashForLookup } from "@/lib/crypto";
import { recordAudit } from "@/server/audit";
import { db } from "@/server/db";

/** Customer identity verification: one open case per customer holding identity + licence documents. */
export async function getOrCreateCustomerCase(userId: string) {
  let profile = await db.customerProfile.findUnique({ where: { userId } });
  if (!profile) {
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    const [firstName, ...rest] = user.name.split(" ");
    profile = await db.customerProfile.create({
      data: { userId, firstName: firstName || user.name, lastName: rest.join(" ") || "-" },
    });
  }
  const existing = await db.verificationCase.findFirst({
    where: {
      customerProfileId: profile.id,
      type: "CUSTOMER_IDENTITY",
      status: { notIn: ["REJECTED", "EXPIRED"] },
    },
    include: {
      documents: {
        where: { status: { not: "REPLACED" } },
        include: { documentType: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (existing) return { profile, verificationCase: existing };
  const created = await db.verificationCase.create({
    data: { customerProfileId: profile.id, type: "CUSTOMER_IDENTITY", status: "DRAFT" },
    include: { documents: { include: { documentType: true } } },
  });
  return { profile, verificationCase: created };
}

export async function saveCustomerIdentityDetails(
  userId: string,
  input: {
    identityNumber?: string;
    drivingLicenceNo?: string;
    drivingLicenceExpiry?: string;
    drivingLicenceCategory?: string;
    dateOfBirth?: string;
    nationality?: string;
  },
) {
  const { profile } = await getOrCreateCustomerCase(userId);
  const updated = await db.customerProfile.update({
    where: { id: profile.id },
    data: {
      ...(input.identityNumber
        ? {
            identityNumberEnc: encryptField(input.identityNumber),
            identityNumberHash: hashForLookup(input.identityNumber),
          }
        : {}),
      ...(input.drivingLicenceNo
        ? {
            drivingLicenceNoEnc: encryptField(input.drivingLicenceNo),
            drivingLicenceNoHash: hashForLookup(input.drivingLicenceNo),
          }
        : {}),
      drivingLicenceExpiry: input.drivingLicenceExpiry
        ? new Date(`${input.drivingLicenceExpiry}T00:00:00.000Z`)
        : profile.drivingLicenceExpiry,
      drivingLicenceCategory: input.drivingLicenceCategory ?? profile.drivingLicenceCategory,
      dateOfBirth: input.dateOfBirth
        ? new Date(`${input.dateOfBirth}T00:00:00.000Z`)
        : profile.dateOfBirth,
      nationality: input.nationality ?? profile.nationality,
    },
  });
  await recordAudit({
    actorId: userId,
    action: "customer.identity.update",
    entityType: "CustomerProfile",
    entityId: profile.id,
  });
  return updated;
}

/** Administrator decision on a customer case (requires `customer.verify`). */
export async function decideCustomerCase(input: {
  caseId: string;
  approve: boolean;
  reason?: string;
  actorId: string;
}) {
  const verificationCase = await db.verificationCase.findUnique({
    where: { id: input.caseId },
    include: {
      documents: { where: { status: { not: "REPLACED" } }, include: { documentType: true } },
    },
  });
  if (!verificationCase || !verificationCase.customerProfileId) throw new Error("CASE_NOT_FOUND");
  if (input.approve) {
    const required = ["customer_identity_document", "customer_driving_licence"];
    const verified = verificationCase.documents
      .filter((d) => d.status === "VERIFIED")
      .map((d) => d.documentType.key);
    const missing = required.filter((k) => !verified.includes(k));
    if (missing.length) throw new Error(`MISSING:${missing.join(",")}`);
  }
  await db.$transaction([
    db.verificationCase.update({
      where: { id: input.caseId },
      data: {
        status: input.approve ? "APPROVED" : "REJECTED",
        reviewedAt: new Date(),
        reviewerId: input.actorId,
        rejectionReason: input.approve ? null : (input.reason ?? null),
      },
    }),
    db.customerProfile.update({
      where: { id: verificationCase.customerProfileId },
      data: input.approve
        ? {
            identityVerifiedAt: new Date(),
            licenceVerifiedAt: new Date(),
            approvedAt: new Date(),
            approvedBy: input.actorId,
          }
        : { approvedAt: null, approvedBy: null },
    }),
  ]);
  await recordAudit({
    actorId: input.actorId,
    action: input.approve ? "customer.verification.approve" : "customer.verification.reject",
    entityType: "VerificationCase",
    entityId: input.caseId,
    reason: input.reason,
  });
}
