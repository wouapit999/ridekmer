import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/alert";
import { DocumentExpiry, DocumentStatusBadge } from "@/features/documents/document-badge";
import { FileLink } from "@/features/documents/file-link";
import { CaseDecisionForm, DocumentReviewForm } from "@/features/admin/review-forms";
import { getVerificationCase } from "@/features/admin/review-queries";
import { redirect } from "@/i18n/navigation";
import { requireStaffMfa, requireUser } from "@/server/auth/session";

export default async function AdminVerificationDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const { user, access } = await requireUser(`/admin/verifications/${id}`);
  await requireStaffMfa(user, access);
  const verificationCase = await getVerificationCase(id);
  if (!verificationCase) notFound();
  const isCustomer = verificationCase.type === "CUSTOMER_IDENTITY";
  if (
    !(isCustomer
      ? access.permissions.has("customer.verify")
      : access.permissions.has("owner.verify"))
  )
    redirect({ href: "/account?forbidden=1", locale: await getLocale() });
  const t = await getTranslations("admin.verifications");
  const currentLocale = (await getLocale()) === "en" ? "en" : "fr";
  const name = (o: { nameFr: string; nameEn: string }) =>
    currentLocale === "en" ? o.nameEn : o.nameFr;
  const subject = verificationCase.customerProfile?.user ?? verificationCase.ownerProfile?.user;
  const required = isCustomer
    ? ["customer_identity_document", "customer_driving_licence"]
    : verificationCase.type === "COMPANY_KYB"
      ? ["owner_national_id", "company_registration", "taxpayer_identification"]
      : ["owner_national_id", "owner_proof_of_address"];
  const verifiedKeys = verificationCase.documents
    .filter((d) => d.status === "VERIFIED")
    .map((d) => d.documentType.key);
  const allVerified = required.every((k) => verifiedKeys.includes(k));
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-sand-900">
          {t("detailTitle")} · {t(`type.${verificationCase.type}`)}
        </h1>
        <Badge
          tone={
            verificationCase.status === "APPROVED"
              ? "good"
              : verificationCase.status === "REJECTED"
                ? "danger"
                : "brand"
          }
        >
          {verificationCase.status}
        </Badge>
      </div>
      <dl className="grid gap-3 rounded-xl border border-sand-200 bg-white p-5 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-sand-600">{t("subject")}</dt>
          <dd className="font-medium">
            {subject?.name} · {subject?.email} · {subject?.phoneNumber ?? "—"}
          </dd>
        </div>
        {verificationCase.ownerProfile?.company ? (
          <div>
            <dt className="text-sand-600">{t("company")}</dt>
            <dd className="font-medium">{verificationCase.ownerProfile.company.legalName}</dd>
          </div>
        ) : null}
        {access.permissions.has("document.verify") ? null : (
          <div>
            <dt className="text-sand-600">{t("documents")}</dt>
            <dd className="text-sand-700">—</dd>
          </div>
        )}
      </dl>
      <ul className="divide-y divide-sand-200 rounded-xl border border-sand-200 bg-white">
        {verificationCase.documents.map((d) => (
          <li key={d.id} className="space-y-2 p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">
                  {name(d.documentType)} <span className="text-sand-500">v{d.version}</span>
                </p>
                <p className="text-sand-600">
                  <DocumentExpiry expiryDate={d.expiryDate} status={d.status} />
                  {d.reviewer ? ` · ${d.reviewer.name}` : ""}
                  {d.rejectionReason ? ` · ${d.rejectionReason}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <DocumentStatusBadge status={d.status} />
                <FileLink
                  storageKey={d.storageKey}
                  fileName={d.fileName}
                  label="↗"
                  actorId={user.id}
                  sensitive
                  reason="verification review"
                />
              </div>
            </div>
            {access.permissions.has("document.verify") ? (
              <DocumentReviewForm documentId={d.id} kind="verification" status={d.status} />
            ) : null}
          </li>
        ))}
      </ul>
      {["SUBMITTED", "UNDER_REVIEW"].includes(verificationCase.status) ? (
        <CaseDecisionForm
          caseId={verificationCase.id}
          caseType={verificationCase.type}
          ownerProfileId={verificationCase.ownerProfile?.id}
          allVerified={allVerified}
        />
      ) : null}
    </div>
  );
}
