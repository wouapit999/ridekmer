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
import { startInspectionAction } from "@/features/inspections/actions";
import { listInspectionsForVehicle } from "@/features/inspections/service";
import { RecordForm, RecordTransitionForm, ScheduleForm } from "@/features/maintenance/forms";
import { listMaintenanceForVehicle } from "@/features/maintenance/service";
import { activeAssignmentForVehicle } from "@/features/tracking/devices";
import { Link } from "@/i18n/navigation";
import { enumLabel } from "@/lib/i18n-enum";
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
  const tm = await getTranslations("maintenance");
  const ti = await getTranslations("inspections");
  const [maintenance, inspections] = await Promise.all([
    listMaintenanceForVehicle(vehicle.id),
    listInspectionsForVehicle(vehicle.id, 10),
  ]);
  const canMaintain = access.permissions.has("maintenance.manage");
  const tracker = await activeAssignmentForVehicle(vehicle.id);
  const tt = await getTranslations("tracking.vehicle");
  const ts = await getTranslations("owner.vehicles.status");
  const ta = await getTranslations("owner.wizard.arrangement");
  const te = await getTranslations("enums");
  const tds = await getTranslations("tracking.devices");
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
                : enumLabel(te, "ownershipModel", vehicle.ownershipModel)}
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
      <section className="space-y-2 rounded-xl border border-sand-200 bg-white p-5 text-sm">
        <h2 className="text-lg font-semibold">{tt("title")}</h2>
        {tracker ? (
          <p>
            {tt(`types.${tracker.device.type}`)} ·{" "}
            <Badge tone={tracker.device.status === "ACTIVE" ? "good" : "warn"}>
              {enumLabel(tds, "statuses", tracker.device.status)}
            </Badge>
            {tracker.device.lastSeenAt
              ? ` · ${tt("lastSeen", { date: format.dateTime(tracker.device.lastSeenAt, "full") })}`
              : ""}
            {tracker.ownerConsentAt
              ? ` · ${tt("consentOn", { date: format.dateTime(tracker.ownerConsentAt, "short") })}`
              : ""}
            {access.permissions.has("tracking.view_history") ? (
              <>
                {" · "}
                <Link
                  href={`/admin/fleet/${vehicle.id}`}
                  className="text-brand-700 hover:underline"
                >
                  {tt("history")}
                </Link>
              </>
            ) : null}
          </p>
        ) : (
          <p className="text-sand-600">{tt("none")}</p>
        )}
      </section>
      <section id="maintenance" className="space-y-3">
        <h2 className="text-lg font-semibold">{tm("sectionTitle")}</h2>
        <div className="grid gap-3 lg:grid-cols-2">
          {maintenance.schedules.map((sch) => (
            <div key={sch.id} className="space-y-2">
              <p className="text-sm">
                <Badge tone={sch.isActive ? "brand" : "neutral"}>{tm(`types.${sch.type}`)}</Badge>{" "}
                {sch.nextDueDate ? format.dateTime(sch.nextDueDate, "short") : ""}
                {sch.nextDueKm ? ` · ${sch.nextDueKm} km` : ""}
                {sch.lastDoneAt
                  ? ` · ${tm("lastDone")}: ${format.dateTime(sch.lastDoneAt, "short")}`
                  : ""}
              </p>
              {canMaintain ? (
                <ScheduleForm
                  vehicleId={vehicle.id}
                  schedule={{
                    id: sch.id,
                    type: sch.type,
                    intervalDays: sch.intervalDays,
                    intervalKm: sch.intervalKm,
                    nextDueDate: sch.nextDueDate
                      ? sch.nextDueDate.toISOString().slice(0, 10)
                      : null,
                    nextDueKm: sch.nextDueKm,
                    reminderDaysBefore: sch.reminderDaysBefore,
                    reminderKmBefore: sch.reminderKmBefore,
                  }}
                />
              ) : null}
            </div>
          ))}
          {canMaintain ? <ScheduleForm vehicleId={vehicle.id} /> : null}
        </div>
        <ul className="space-y-3">
          {maintenance.records.map((r) => (
            <li key={r.id} className="rounded-xl border border-sand-200 bg-white p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">
                  {tm(`types.${r.type}`)} · {r.title}
                </span>
                <Badge
                  tone={
                    r.status === "COMPLETED"
                      ? "good"
                      : r.status === "CANCELLED"
                        ? "neutral"
                        : r.status === "IN_PROGRESS"
                          ? "brand"
                          : "warn"
                  }
                >
                  {tm(`statuses.${r.status}`)}
                </Badge>
              </div>
              <p className="text-xs text-sand-600">
                {r.scheduledFor
                  ? `${tm("scheduledFor")}: ${format.dateTime(r.scheduledFor, "short")} · `
                  : ""}
                {r.quoteXaf ? `${tm("quoteXaf")}: ${formatXaf(r.quoteXaf, currentLocale)} · ` : ""}
                {r.finalCostXaf
                  ? `${tm("finalCostXaf")}: ${formatXaf(r.finalCostXaf, currentLocale)} · `
                  : ""}
                {r.providerName ?? ""} {r.createdBy?.name ? `· ${r.createdBy.name}` : ""}
              </p>
              {r.description ? (
                <p className="mt-1 whitespace-pre-line text-sand-700">{r.description}</p>
              ) : null}
              {canMaintain ? (
                <div className="mt-2">
                  <RecordTransitionForm recordId={r.id} status={r.status} />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
        {canMaintain ? <RecordForm vehicleId={vehicle.id} /> : null}
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{ti("sectionTitle")}</h2>
        <ul className="divide-y divide-sand-200 rounded-xl border border-sand-200 bg-white text-sm">
          {inspections.length === 0 ? (
            <li className="px-4 py-3 text-sand-600">{ti("none")}</li>
          ) : null}
          {inspections.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <span>
                <Link
                  href={`/admin/inspections/${i.id}`}
                  className="font-medium text-brand-700 hover:underline"
                >
                  {ti(`types.${i.type}`)}
                </Link>{" "}
                · {format.dateTime(i.performedAt, "full")} · {i.inspector?.name ?? ""}
                {i.booking ? ` · ${i.booking.reference}` : ""} · {i.mileageKm ?? "—"} km
              </span>
              <Badge
                tone={i.status === "DRAFT" ? "warn" : i.status === "DISPUTED" ? "danger" : "good"}
              >
                {ti(`statuses.${i.status}`)}
              </Badge>
            </li>
          ))}
        </ul>
        {access.permissions.has("inspection.perform") ? (
          <form action={startInspectionAction}>
            <input type="hidden" name="vehicleId" value={vehicle.id} />
            <input type="hidden" name="type" value="PERIODIC" />
            <Button type="submit" variant="outline" size="sm">
              {ti("startPeriodic")}
            </Button>
          </form>
        ) : null}
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
