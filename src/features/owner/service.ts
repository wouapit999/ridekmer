import { renderContract } from "@ridekmer/contracts";

import { encryptField, hashForLookup } from "@/lib/crypto";
import { parsePhone } from "@/lib/phone";
import { recordAudit } from "@/server/audit";
import { db } from "@/server/db";

import { OWNER_STEPS, type OwnerProfileInput, type OwnerStep, type PayoutInput } from "./schemas";

export class OwnerError extends Error {
  constructor(
    public readonly code:
      "NO_PROFILE" | "INVALID_PHONE" | "TEMPLATE_MISSING" | "ALREADY_ACCEPTED" | "CASE_MISSING",
  ) {
    super(code);
    this.name = "OwnerError";
  }
}

function advance(current: string, candidate: OwnerStep): OwnerStep {
  const order = OWNER_STEPS as readonly string[];
  return (order.indexOf(candidate) > order.indexOf(current) ? candidate : current) as OwnerStep;
}

export async function getOwnerProfile(userId: string) {
  return db.ownerProfile.findUnique({
    where: { userId },
    include: {
      company: true,
      verificationCases: {
        include: {
          documents: { where: { status: { not: "REPLACED" } }, include: { documentType: true } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });
}

export async function saveOwnerProfile(userId: string, input: OwnerProfileInput) {
  const profile = await db.ownerProfile.findUnique({ where: { userId } });
  if (!profile) throw new OwnerError("NO_PROFILE");
  const updated = await db.ownerProfile.update({
    where: { id: profile.id },
    data: {
      ownerType: input.ownerType,
      displayName: input.displayName,
      firstName: input.firstName ?? null,
      lastName: input.lastName ?? null,
      identityNumberEnc: input.identityNumber
        ? encryptField(input.identityNumber)
        : profile.identityNumberEnc,
      identityNumberHash: input.identityNumber
        ? hashForLookup(input.identityNumber)
        : profile.identityNumberHash,
      taxIdentifierEnc: input.taxIdentifier
        ? encryptField(input.taxIdentifier)
        : profile.taxIdentifierEnc,
      onboardingStep: advance(profile.onboardingStep, "payout"),
      company:
        input.ownerType === "COMPANY"
          ? {
              upsert: {
                create: {
                  legalName: input.legalName!,
                  tradeName: input.tradeName ?? null,
                  registrationNumberEnc: input.registrationNumber
                    ? encryptField(input.registrationNumber)
                    : null,
                  registrationNumberHsh: input.registrationNumber
                    ? hashForLookup(input.registrationNumber)
                    : null,
                  taxpayerNumberEnc: input.taxpayerNumber
                    ? encryptField(input.taxpayerNumber)
                    : null,
                  legalForm: input.legalForm ?? null,
                  representativeName: input.representativeName ?? null,
                  representativeTitle: input.representativeTitle ?? null,
                  contactEmail: input.contactEmail ?? null,
                  contactPhone: input.contactPhone ?? null,
                },
                update: {
                  legalName: input.legalName!,
                  tradeName: input.tradeName ?? null,
                  ...(input.registrationNumber
                    ? {
                        registrationNumberEnc: encryptField(input.registrationNumber),
                        registrationNumberHsh: hashForLookup(input.registrationNumber),
                      }
                    : {}),
                  ...(input.taxpayerNumber
                    ? { taxpayerNumberEnc: encryptField(input.taxpayerNumber) }
                    : {}),
                  legalForm: input.legalForm ?? null,
                  representativeName: input.representativeName ?? null,
                  representativeTitle: input.representativeTitle ?? null,
                  contactEmail: input.contactEmail ?? null,
                  contactPhone: input.contactPhone ?? null,
                },
              },
            }
          : undefined,
    },
  });
  await ensureVerificationCase(
    updated.id,
    input.ownerType === "COMPANY" ? "COMPANY_KYB" : "OWNER_KYC",
  );
  await recordAudit({
    actorId: userId,
    action: "owner.profile.update",
    entityType: "OwnerProfile",
    entityId: profile.id,
    after: { ownerType: input.ownerType, displayName: input.displayName },
  });
  return updated;
}

export async function ensureVerificationCase(
  ownerProfileId: string,
  type: "OWNER_KYC" | "COMPANY_KYB",
) {
  const existing = await db.verificationCase.findFirst({
    where: { ownerProfileId, type, status: { notIn: ["REJECTED", "EXPIRED"] } },
  });
  if (existing) return existing;
  return db.verificationCase.create({ data: { ownerProfileId, type, status: "DRAFT" } });
}

export async function savePayoutDetails(userId: string, input: PayoutInput) {
  const profile = await db.ownerProfile.findUnique({ where: { userId } });
  if (!profile) throw new OwnerError("NO_PROFILE");
  let mobile: string | null = null;
  if (input.payoutMethod !== "BANK_TRANSFER") {
    const parsed = parsePhone(input.payoutMobileNumber ?? "", false);
    if (!parsed) throw new OwnerError("INVALID_PHONE");
    mobile = parsed.e164;
  }
  const updated = await db.ownerProfile.update({
    where: { id: profile.id },
    data: {
      payoutMethod: input.payoutMethod,
      payoutMobileNumber: mobile,
      payoutBankName:
        input.payoutMethod === "BANK_TRANSFER" ? (input.payoutBankName ?? null) : null,
      payoutBankAccountEnc:
        input.payoutMethod === "BANK_TRANSFER" && input.payoutBankAccount
          ? encryptField(input.payoutBankAccount)
          : null,
      payoutAccountName: input.payoutAccountName,
      payoutVerifiedAt: null,
      onboardingStep: advance(profile.onboardingStep, "documents"),
    },
  });
  await recordAudit({
    actorId: userId,
    action: "owner.payout.update",
    entityType: "OwnerProfile",
    entityId: profile.id,
    after: { method: input.payoutMethod },
  });
  return updated;
}

export async function markDocumentsStepDone(userId: string) {
  const profile = await db.ownerProfile.findUnique({ where: { userId } });
  if (!profile) throw new OwnerError("NO_PROFILE");
  return db.ownerProfile.update({
    where: { id: profile.id },
    data: { onboardingStep: advance(profile.onboardingStep, "agreement") },
  });
}

/** Render the current owner agreement for preview (not persisted). */
export async function previewOwnerAgreement(userId: string, locale: "fr" | "en") {
  const profile = await db.ownerProfile.findUnique({
    where: { userId },
    include: { company: true, user: true },
  });
  if (!profile) throw new OwnerError("NO_PROFILE");
  const version = await db.contractTemplateVersion.findFirst({
    where: {
      template: { key: "owner_management_agreement", isActive: true },
      locale,
      publishedAt: { not: null },
    },
    orderBy: { version: "desc" },
    include: { template: true },
  });
  if (!version) throw new OwnerError("TEMPLATE_MISSING");
  const variables = {
    ownerName:
      profile.ownerType === "COMPANY"
        ? (profile.company?.legalName ?? profile.displayName)
        : profile.displayName,
    ownerEmail: profile.user.email,
    ownerType: profile.ownerType,
    isCompany: profile.ownerType === "COMPANY",
    representativeName: profile.company?.representativeName ?? "",
    date: new Date().toISOString().slice(0, 10),
    commissionManagedPercent: 20,
    commissionSelfManagedPercent: 15,
    platformName: "RideKmer",
  };
  return { version, rendered: renderContract(version.bodyMarkdown, variables), variables };
}

/** Generate an immutable copy of the agreement and record click-to-accept evidence. */
export async function acceptOwnerAgreement(
  userId: string,
  locale: "fr" | "en",
  evidence: { ipAddress?: string; userAgent?: string },
) {
  const profile = await db.ownerProfile.findUnique({ where: { userId }, include: { user: true } });
  if (!profile) throw new OwnerError("NO_PROFILE");
  if (profile.agreementAcceptedAt) throw new OwnerError("ALREADY_ACCEPTED");
  const { version, rendered, variables } = await previewOwnerAgreement(userId, locale);
  const contract = await db.$transaction(async (tx) => {
    const generated = await tx.generatedContract.create({
      data: {
        templateVersionId: version.id,
        type: "OWNER_MANAGEMENT_AGREEMENT",
        status: "ACCEPTED",
        subjectType: "OwnerProfile",
        subjectId: profile.id,
        signatoryId: userId,
        locale,
        renderedMarkdown: rendered.markdown,
        checksumSha256: rendered.checksumSha256,
        variablesSnapshot: variables,
        acceptedAt: new Date(),
      },
    });
    await tx.signatureEvidence.create({
      data: {
        contractId: generated.id,
        signatoryId: userId,
        signatoryName: profile.user.name,
        method: "CLICK_TO_ACCEPT",
        ipAddress: evidence.ipAddress,
        userAgent: evidence.userAgent,
        contractChecksum: rendered.checksumSha256,
      },
    });
    await tx.ownerProfile.update({
      where: { id: profile.id },
      data: {
        agreementAcceptedAt: new Date(),
        onboardingStep: "vehicles",
        onboardingComplete: true,
      },
    });
    return generated;
  });
  await recordAudit({
    actorId: userId,
    action: "owner.agreement.accept",
    entityType: "GeneratedContract",
    entityId: contract.id,
    after: { checksum: rendered.checksumSha256, templateVersion: version.version, locale },
  });
  return contract;
}

/** Administrator KYC decision on an owner (requires `owner.verify`). */
export async function decideOwnerKyc(input: {
  ownerProfileId: string;
  approve: boolean;
  reason?: string;
  actorId: string;
}) {
  const profile = await db.ownerProfile.findUnique({
    where: { id: input.ownerProfileId },
    include: { company: true },
  });
  if (!profile) throw new OwnerError("NO_PROFILE");
  const type = profile.ownerType === "COMPANY" ? "COMPANY_KYB" : "OWNER_KYC";
  const kycCase = await db.verificationCase.findFirst({
    where: { ownerProfileId: profile.id, type, status: { in: ["SUBMITTED", "UNDER_REVIEW"] } },
  });
  if (!kycCase) throw new OwnerError("CASE_MISSING");
  await db.$transaction([
    db.verificationCase.update({
      where: { id: kycCase.id },
      data: {
        status: input.approve ? "APPROVED" : "REJECTED",
        reviewedAt: new Date(),
        reviewerId: input.actorId,
        rejectionReason: input.approve ? null : (input.reason ?? null),
      },
    }),
    db.ownerProfile.update({
      where: { id: profile.id },
      data: {
        kycApprovedAt: input.approve ? new Date() : null,
        kycApprovedBy: input.approve ? input.actorId : null,
      },
    }),
    ...(profile.company
      ? [
          db.companyProfile.update({
            where: { id: profile.company.id },
            data: { kybApprovedAt: input.approve ? new Date() : null },
          }),
        ]
      : []),
  ]);
  await recordAudit({
    actorId: input.actorId,
    action: input.approve ? "owner.kyc.approve" : "owner.kyc.reject",
    entityType: "OwnerProfile",
    entityId: profile.id,
    reason: input.reason,
  });
}
