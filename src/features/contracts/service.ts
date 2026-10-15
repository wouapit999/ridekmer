import { renderContract } from "@ridekmer/contracts";

import { formatXaf } from "@/lib/money";
import { recordAudit } from "@/server/audit";
import { db } from "@/server/db";

import type { ContractType } from "@/generated/prisma/enums";

export class ContractError extends Error {
  constructor(
    public readonly code:
      | "NOT_FOUND"
      | "FORBIDDEN"
      | "TEMPLATE_MISSING"
      | "INVALID_STATUS"
      | "ALREADY_ACCEPTED"
      | "BOOKING_STATUS",
    message?: string,
  ) {
    super(message ?? code);
    this.name = "ContractError";
  }
}

const TEMPLATE_KEYS: Partial<Record<ContractType, string>> = {
  CUSTOMER_RENTAL_AGREEMENT: "customer_rental_agreement",
  OWNER_MANAGEMENT_AGREEMENT: "owner_management_agreement",
};

function fmt(date: Date, locale: "fr" | "en") {
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Africa/Douala",
  }).format(date);
}

export async function latestTemplateVersion(key: string, locale: "fr" | "en") {
  const version = await db.contractTemplateVersion.findFirst({
    where: { template: { key, isActive: true }, locale, publishedAt: { not: null } },
    orderBy: { version: "desc" },
    include: { template: true },
  });
  if (!version) throw new ContractError("TEMPLATE_MISSING", key);
  return version;
}

async function rentalVariables(bookingId: string, locale: "fr" | "en") {
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: {
      customer: { select: { id: true, name: true, email: true } },
      vehicle: {
        select: {
          make: true,
          model: true,
          registrationNumber: true,
          dailyKmAllowance: true,
          extraKmRateXaf: true,
        },
      },
      pickupBranch: { select: { nameFr: true, nameEn: true } },
      priceSnapshots: { orderBy: { sequence: "desc" }, take: 1 },
    },
  });
  if (!booking) throw new ContractError("NOT_FOUND");
  const snapshot = booking.priceSnapshots[0];
  return {
    booking,
    variables: {
      platformName: "RideKmer",
      reference: booking.reference,
      customerName: booking.customer.name,
      customerEmail: booking.customer.email,
      vehicle: `${booking.vehicle.make} ${booking.vehicle.model}`,
      registrationNumber: booking.vehicle.registrationNumber,
      chauffeur: booking.type === "CHAUFFEUR_DRIVEN",
      startAt: fmt(booking.startAt, locale),
      endAt: fmt(booking.endAt, locale),
      rentalDays: booking.rentalDays,
      pickup:
        booking.pickupMode === "DELIVERY"
          ? (booking.pickupAddress ?? "")
          : ((locale === "en" ? booking.pickupBranch?.nameEn : booking.pickupBranch?.nameFr) ?? ""),
      totalRental: snapshot ? formatXaf(snapshot.totalRentalXaf, locale) : "",
      deposit: snapshot ? formatXaf(snapshot.securityDepositXaf, locale) : "",
      kmAllowance: snapshot?.kmAllowance ?? booking.vehicle.dailyKmAllowance ?? 0,
      extraKmRate: formatXaf(
        snapshot?.extraKmRateXaf ?? booking.vehicle.extraKmRateXaf ?? 0,
        locale,
      ),
      date: new Date().toISOString().slice(0, 10),
    },
  };
}

/**
 * Generate (idempotently) the rental agreement for a booking. The rendered markdown and its
 * checksum are frozen in GeneratedContract; a later booking change supersedes the previous
 * unaccepted copy and renders a new one.
 */
export async function ensureRentalContract(bookingId: string, locale: "fr" | "en") {
  const existing = await db.generatedContract.findFirst({
    where: {
      bookingId,
      type: "CUSTOMER_RENTAL_AGREEMENT",
      status: { in: ["GENERATED", "SENT", "ACCEPTED"] },
    },
    orderBy: { createdAt: "desc" },
  });
  const { booking, variables } = await rentalVariables(bookingId, locale);
  if (existing?.status === "ACCEPTED") return existing;
  const version = await latestTemplateVersion(TEMPLATE_KEYS.CUSTOMER_RENTAL_AGREEMENT!, locale);
  const rendered = renderContract(version.bodyMarkdown, variables);
  if (existing && existing.checksumSha256 === rendered.checksumSha256) return existing;
  const contract = await db.$transaction(async (tx) => {
    if (existing)
      await tx.generatedContract.update({
        where: { id: existing.id },
        data: { status: "SUPERSEDED", voidedAt: new Date() },
      });
    return tx.generatedContract.create({
      data: {
        templateVersionId: version.id,
        type: "CUSTOMER_RENTAL_AGREEMENT",
        status: "SENT",
        bookingId,
        subjectType: "Booking",
        subjectId: bookingId,
        signatoryId: booking.customerId,
        locale,
        renderedMarkdown: rendered.markdown,
        checksumSha256: rendered.checksumSha256,
        variablesSnapshot: variables,
      },
    });
  });
  await recordAudit({
    actorType: "SYSTEM",
    action: "contract.generate",
    entityType: "GeneratedContract",
    entityId: contract.id,
    after: {
      bookingId,
      templateVersion: version.version,
      locale,
      supersedes: existing?.id ?? null,
    },
  });
  return contract;
}

export async function getContractForCustomer(contractId: string, userId: string) {
  const contract = await db.generatedContract.findUnique({
    where: { id: contractId },
    include: { signatures: true, booking: { select: { id: true, reference: true, status: true } } },
  });
  if (!contract || contract.signatoryId !== userId) throw new ContractError("NOT_FOUND");
  return contract;
}

/** Click-to-accept with evidence capture (ADR: not a certified electronic signature). */
export async function acceptContract(
  contractId: string,
  userId: string,
  evidence: { ipAddress?: string; userAgent?: string },
) {
  const contract = await db.generatedContract.findUnique({ where: { id: contractId } });
  if (!contract || contract.signatoryId !== userId) throw new ContractError("NOT_FOUND");
  if (contract.status === "ACCEPTED") throw new ContractError("ALREADY_ACCEPTED");
  if (contract.status !== "GENERATED" && contract.status !== "SENT")
    throw new ContractError("INVALID_STATUS");
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true } });
  const accepted = await db.$transaction(async (tx) => {
    const u = await tx.generatedContract.update({
      where: { id: contract.id },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
    });
    await tx.signatureEvidence.create({
      data: {
        contractId: contract.id,
        signatoryId: userId,
        signatoryName: user.name,
        method: "CLICK_TO_ACCEPT",
        ipAddress: evidence.ipAddress,
        userAgent: evidence.userAgent,
        contractChecksum: contract.checksumSha256,
      },
    });
    return u;
  });
  await recordAudit({
    actorId: userId,
    action: "contract.accept",
    entityType: "GeneratedContract",
    entityId: contract.id,
    after: { checksum: contract.checksumSha256, method: "CLICK_TO_ACCEPT" },
  });
  return accepted;
}

export async function listContractsForBooking(bookingId: string) {
  return db.generatedContract.findMany({
    where: { bookingId },
    orderBy: { createdAt: "desc" },
    include: { signatures: true, templateVersion: { select: { version: true } } },
  });
}

/** Admin: publish a new template version (immutable; previous accepted contracts unchanged). */
export async function publishTemplateVersion(input: {
  templateKey: string;
  locale: "fr" | "en";
  bodyMarkdown: string;
  authorId: string;
}) {
  const { checksum, extractVariables } = await import("@ridekmer/contracts");
  const template = await db.contractTemplate.findUnique({ where: { key: input.templateKey } });
  if (!template) throw new ContractError("TEMPLATE_MISSING");
  const latest = await db.contractTemplateVersion.findFirst({
    where: { templateId: template.id, locale: input.locale },
    orderBy: { version: "desc" },
  });
  const version = await db.contractTemplateVersion.create({
    data: {
      templateId: template.id,
      version: (latest?.version ?? 0) + 1,
      locale: input.locale,
      bodyMarkdown: input.bodyMarkdown,
      variables: extractVariables(input.bodyMarkdown),
      checksumSha256: checksum(input.bodyMarkdown),
      publishedAt: new Date(),
      authorId: input.authorId,
    },
  });
  await recordAudit({
    actorId: input.authorId,
    action: "contract_template.publish",
    entityType: "ContractTemplateVersion",
    entityId: version.id,
    after: { templateKey: input.templateKey, locale: input.locale, version: version.version },
  });
  return version;
}

export async function listTemplatesForAdmin() {
  return db.contractTemplate.findMany({
    orderBy: { key: "asc" },
    include: {
      versions: {
        orderBy: [{ locale: "asc" }, { version: "desc" }],
        include: { author: { select: { name: true } } },
      },
    },
  });
}

export async function listGeneratedContractsForAdmin(page: number, pageSize = 25) {
  const [total, contracts] = await Promise.all([
    db.generatedContract.count(),
    db.generatedContract.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        booking: { select: { id: true, reference: true } },
        signatory: { select: { name: true } },
        signatures: { select: { acceptedAt: true, method: true } },
      },
    }),
  ]);
  return { total, contracts, pages: Math.max(1, Math.ceil(total / pageSize)) };
}
