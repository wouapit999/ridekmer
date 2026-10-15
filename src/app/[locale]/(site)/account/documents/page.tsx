import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";

import { Badge } from "@/components/ui/alert";
import { Container, PageHeader } from "@/components/ui/container";
import { AccountNav } from "@/features/account/account-nav";
import { DocumentExpiry, DocumentStatusBadge } from "@/features/documents/document-badge";
import { DocumentUploadForm } from "@/features/documents/upload-form";
import { FileLink } from "@/features/documents/file-link";
import { uploadCustomerDocumentAction } from "@/features/verification/actions";
import { getOrCreateCustomerCase } from "@/features/verification/service";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";

export default async function AccountDocumentsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { user } = await requireUser("/account/documents");
  const t = await getTranslations("account.documents");
  const currentLocale = (await getLocale()) === "en" ? "en" : "fr";
  const { verificationCase } = await getOrCreateCustomerCase(user.id);
  const types = await db.documentType.findMany({
    where: { key: { in: ["customer_identity_document", "customer_driving_licence"] } },
  });
  const name = (o: { nameFr: string; nameEn: string }) =>
    currentLocale === "en" ? o.nameEn : o.nameFr;
  return (
    <Container className="py-10">
      <PageHeader title={t("title")} intro={t("intro")} />
      <AccountNav current="documents" />
      <div className="mt-6 max-w-3xl space-y-6">
        <p className="text-sm">
          {t("status")}:{" "}
          <Badge
            tone={
              verificationCase.status === "APPROVED"
                ? "good"
                : verificationCase.status === "REJECTED"
                  ? "danger"
                  : "brand"
            }
          >
            {t(`caseStatus.${verificationCase.status}`)}
          </Badge>
          {verificationCase.rejectionReason ? (
            <span className="ml-2 text-danger-700">{verificationCase.rejectionReason}</span>
          ) : null}
        </p>
        {types.map((type) => {
          const doc = verificationCase.documents.find((d) => d.documentTypeId === type.id);
          return (
            <section key={type.id} className="space-y-3">
              <h2 className="text-lg font-semibold">{name(type)}</h2>
              {doc ? (
                <p className="flex flex-wrap items-center gap-3 text-sm">
                  <DocumentStatusBadge status={doc.status} />
                  <DocumentExpiry expiryDate={doc.expiryDate} status={doc.status} />
                  {doc.rejectionReason ? (
                    <span className="text-danger-700">{doc.rejectionReason}</span>
                  ) : null}
                  <FileLink
                    storageKey={doc.storageKey}
                    fileName={doc.fileName}
                    label="↗"
                    actorId={user.id}
                    sensitive
                    reason="self"
                  />
                </p>
              ) : null}
              {!doc || doc.status === "REJECTED" || doc.status === "EXPIRED" ? (
                <DocumentUploadForm
                  action={uploadCustomerDocumentAction}
                  types={[
                    {
                      key: type.key,
                      name: name(type),
                      isMandatory: true,
                      requiresExpiry: type.requiresExpiry,
                      requiresNumber: type.requiresNumber,
                    },
                  ]}
                  lockType={type.key}
                />
              ) : null}
            </section>
          );
        })}
      </div>
    </Container>
  );
}
