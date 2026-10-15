import { getFormatter, getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { Alert, Badge } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DocumentExpiry, DocumentStatusBadge } from "@/features/documents/document-badge";
import { FileLink } from "@/features/documents/file-link";
import { revokeOverrideAction } from "@/features/admin/review-actions";
import {
  DocumentReviewForm,
  OverrideForm,
  VehicleDecisionForm,
} from "@/features/admin/review-forms";
import { getVehicleForAdmin } from "@/features/admin/review-queries";
import { formatXaf } from "@/lib/money";
import { requirePermission } from "@/server/auth/session";

const TONE: Record<string, "neutral" | "brand" | "warn" | "danger" | "good"> = {
  DRAFT: "neutral",
  SUBMITTED: "brand",
  UNDER_REVIEW: "brand",
  APPROVED: "good",
  ACTIVE: "good",
  SUSPENDED: "warn",
  UNAVAILABLE_DOCUMENTS: "danger",
  WITHDRAWN: "neutral",
  REJECTED: "danger",
};

export default async function AdminVehicleDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const { user, access } = await requirePermission("vehicle.view_all", `/admin/vehicles/${id}`);
  const vehicle = await getVehicleForAdmin(id);
  if (!vehicle) notFound();
  const t = await getTranslations("admin.vehicles");
  const ts = await getTranslations("owner.vehicles.status");
  const ta = await getTranslations("owner.wizard.arrangement");
  const currentLocale = (await getLocale()) === "en" ? "en" : "fr";
  const format = await getFormatter();
  const name = (o: { nameFr: string; nameEn: string }) =>
    currentLocale === "en" ? o.nameEn : o.nameFr;
  const now = new Date();
  const canOverride = access.permissions.has("document.override_block");
  const canVerifyDocs = access.permissions.has("document.verify");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-sand-900">
          {t("detailTitle", {
            make: vehicle.make,
            model: vehicle.model,
            plate: vehicle.registrationNumber,
          })}
        </h1>
        <Badge tone={TONE[vehicle.status]}>{ts(vehicle.status)}</Badge>
      </div>
      {vehicle.ownerRequestType ? (
        <Alert tone="warning">
          {t("ownerRequest", {
            type: vehicle.ownerRequestType,
            reason: vehicle.ownerRequestReason ?? "",
            date: format.dateTime(vehicle.ownerRequestedAt ?? now, "short"),
          })}
        </Alert>
      ) : null}
      {vehicle.rejectionReason ? <Alert tone="danger">{vehicle.rejectionReason}</Alert> : null}
      {vehicle.suspensionReason ? <Alert tone="warning">{vehicle.suspensionReason}</Alert> : null}

      <dl className="grid gap-3 rounded-xl border border-sand-200 bg-white p-5 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-sand-600">{t("owner")}</dt>
          <dd className="font-medium">
            {vehicle.ownerProfile
              ? `${vehicle.ownerProfile.displayName} · ${vehicle.ownerProfile.user.email}`
              : "RideKmer"}
            {vehicle.ownerProfile ? (
              <span className="ml-2 text-xs text-sand-600">
                ({t("ownerKyc")}:{" "}
                {vehicle.ownerProfile.kycApprovedAt ? t("kycApproved") : t("kycPending")})
              </span>
            ) : null}
          </dd>
        </div>
        <div>
          <dt className="text-sand-600">{t("city")}</dt>
          <dd className="font-medium">
            {name(vehicle.city)} {vehicle.branch ? `· ${name(vehicle.branch)}` : ""}
          </dd>
        </div>
        <div>
          <dt className="text-sand-600">{t("pricing")}</dt>
          <dd className="font-medium">
            {formatXaf(vehicle.dailyPriceXaf, currentLocale)} {t("perDay")} ·{" "}
            {formatXaf(vehicle.securityDepositXaf, currentLocale)} {t("deposit")}
          </dd>
        </div>
        <div>
          <dt className="text-sand-600">{t("arrangement")}</dt>
          <dd className="font-medium">
            {vehicle.ownershipModel === "SELF_MANAGED_MARKETPLACE_VEHICLE"
              ? ta("SELF_MANAGED_MARKETPLACE_VEHICLE")
              : vehicle.ownershipModel === "FULLY_MANAGED_OWNER_VEHICLE"
                ? ta("FULLY_MANAGED_OWNER_VEHICLE")
                : "RIDEKMER_OWNED"}
          </dd>
        </div>
      </dl>

      <section>
        <h2 className="text-lg font-semibold">{t("photos")}</h2>
        {vehicle.images.length === 0 ? (
          <p className="text-sm text-sand-600">{t("noPhotos")}</p>
        ) : null}
        <ul className="mt-2 flex flex-wrap gap-2 text-sm">
          {vehicle.images.map((img, i) => (
            <li key={img.id} className="rounded-md border border-sand-200 bg-white px-3 py-1">
              <FileLink
                storageKey={img.storageKey}
                label={`${t("openPhoto")} ${i + 1}${img.isPrimary ? " ★" : ""}`}
                actorId={user.id}
              />
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("documents")}</h2>
        {vehicle.documents.length === 0 ? (
          <p className="text-sm text-sand-600">{t("noDocuments")}</p>
        ) : null}
        <ul className="divide-y divide-sand-200 rounded-xl border border-sand-200 bg-white">
          {vehicle.documents.map((d) => (
            <li key={d.id} className="space-y-2 p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {name(d.documentType)} <span className="text-sand-500">v{d.version}</span>{" "}
                    {d.documentType.isMandatory ? <span className="text-danger-700">*</span> : null}
                  </p>
                  <p className="text-sand-600">
                    <DocumentExpiry expiryDate={d.expiryDate} status={d.status} />
                    {d.issuer ? ` · ${d.issuer}` : ""}
                    {d.reviewer ? ` · ${t("reviewedBy", { name: d.reviewer.name })}` : ""}
                    {d.rejectionReason ? ` · ${d.rejectionReason}` : ""}
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
                    reason="vehicle document review"
                  />
                </div>
              </div>
              {canVerifyDocs ? (
                <DocumentReviewForm documentId={d.id} kind="vehicle" status={d.status} />
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <VehicleDecisionForm
          vehicleId={vehicle.id}
          status={vehicle.status}
          permissions={[...access.permissions]}
        />
        {canOverride ? (
          <div className="space-y-3">
            <OverrideForm vehicleId={vehicle.id} />
            <ul className="space-y-2 text-sm">
              {vehicle.documentOverrides.map((o) => (
                <li
                  key={o.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sand-200 bg-white px-4 py-2"
                >
                  <span>
                    {o.reason} · {o.createdBy.name} ·{" "}
                    {o.revokedAt
                      ? t("overrideRevoked")
                      : o.expiresAt > now
                        ? t("overrideActive", { date: format.dateTime(o.expiresAt, "short") })
                        : t("overrideExpired")}
                  </span>
                  {!o.revokedAt && o.expiresAt > now ? (
                    <form action={revokeOverrideAction}>
                      <input type="hidden" name="overrideId" value={o.id} />
                      <input type="hidden" name="reason" value="revoked by administrator" />
                      <Button type="submit" variant="ghost" size="sm">
                        {t("revokeOverride")}
                      </Button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
