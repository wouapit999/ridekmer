import { getFormatter, getLocale, getTranslations, setRequestLocale } from "next-intl/server";

import { DocumentExpiry, DocumentStatusBadge } from "@/features/documents/document-badge";
import { FileLink } from "@/features/documents/file-link";
import { DocumentReviewForm } from "@/features/admin/review-forms";
import { listDocumentQueue } from "@/features/admin/review-queries";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/server/auth/session";

export default async function AdminDocumentQueuePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { user } = await requirePermission("document.verify", "/admin/documents");
  const t = await getTranslations("admin.documentQueue");
  const tv = await getTranslations("admin.verifications");
  const currentLocale = (await getLocale()) === "en" ? "en" : "fr";
  const format = await getFormatter();
  const { vehicleDocs, verificationDocs } = await listDocumentQueue();
  const name = (o: { nameFr: string; nameEn: string }) =>
    currentLocale === "en" ? o.nameEn : o.nameFr;
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-sand-900">{t("title")}</h1>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          {t("vehicleDocs")} ({vehicleDocs.length})
        </h2>
        {vehicleDocs.length === 0 ? <p className="text-sm text-sand-600">{t("empty")}</p> : null}
        <ul className="divide-y divide-sand-200 rounded-xl border border-sand-200 bg-white">
          {vehicleDocs.map((d) => (
            <li key={d.id} className="space-y-2 p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {name(d.documentType)} ·{" "}
                    <Link
                      href={`/admin/vehicles/${d.vehicle.id}`}
                      className="text-brand-700 hover:underline"
                    >
                      {d.vehicle.make} {d.vehicle.model} ({d.vehicle.registrationNumber})
                    </Link>
                  </p>
                  <p className="text-sand-600">
                    {t("uploaded")} {format.dateTime(d.createdAt, "short")} ·{" "}
                    <DocumentExpiry expiryDate={d.expiryDate} status={d.status} />
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <DocumentStatusBadge status={d.status} />
                  <FileLink
                    storageKey={d.storageKey}
                    fileName={d.fileName}
                    label={t("open")}
                    actorId={user.id}
                    sensitive
                    reason="document queue"
                  />
                </div>
              </div>
              <DocumentReviewForm documentId={d.id} kind="vehicle" status={d.status} />
            </li>
          ))}
        </ul>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          {t("verificationDocs")} ({verificationDocs.length})
        </h2>
        {verificationDocs.length === 0 ? (
          <p className="text-sm text-sand-600">{t("empty")}</p>
        ) : null}
        <ul className="divide-y divide-sand-200 rounded-xl border border-sand-200 bg-white">
          {verificationDocs.map((d) => {
            const subject =
              d.verificationCase.customerProfile?.user.name ??
              d.verificationCase.ownerProfile?.displayName ??
              "—";
            return (
              <li key={d.id} className="space-y-2 p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {name(d.documentType)} ·{" "}
                      <Link
                        href={`/admin/verifications/${d.verificationCase.id}`}
                        className="text-brand-700 hover:underline"
                      >
                        {subject}
                      </Link>{" "}
                      <span className="text-sand-500">
                        ({tv(`type.${d.verificationCase.type}`)})
                      </span>
                    </p>
                    <p className="text-sand-600">
                      {t("uploaded")} {format.dateTime(d.createdAt, "short")} ·{" "}
                      <DocumentExpiry expiryDate={d.expiryDate} status={d.status} />
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <DocumentStatusBadge status={d.status} />
                    <FileLink
                      storageKey={d.storageKey}
                      fileName={d.fileName}
                      label={t("open")}
                      actorId={user.id}
                      sensitive
                      reason="document queue"
                    />
                  </div>
                </div>
                <DocumentReviewForm documentId={d.id} kind="verification" status={d.status} />
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
