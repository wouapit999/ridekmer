import { getFormatter, getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/alert";
import {
  IncidentResolutionForm,
  IncidentTransitionForm,
  InsuranceClaimForm,
} from "@/features/incidents/forms";
import { getIncidentForStaff } from "@/features/incidents/service";
import { Link } from "@/i18n/navigation";
import { formatXaf } from "@/lib/money";
import { requirePermission } from "@/server/auth/session";
import { trySignedDownloadUrl } from "@/server/files/service";

export default async function AdminIncidentDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const { user, access } = await requirePermission("incident.manage", `/admin/incidents/${id}`);
  const incident = await getIncidentForStaff(id);
  if (!incident) notFound();
  const t = await getTranslations("incidents");
  const currentLocale = (await getLocale()) === "en" ? "en" : "fr";
  const format = await getFormatter();
  const photos = await Promise.all(
    incident.photoKeys.map(async (key) => ({
      key,
      url: (await trySignedDownloadUrl({ storageKey: key, actorId: user.id })) ?? "",
    })),
  );
  const canResolve = access.permissions.has("incident.resolve");
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-sand-900">
          {incident.reference} · {t(`types.${incident.type}`)}
        </h1>
        <Badge
          tone={
            incident.status === "CLOSED" || incident.status === "RESOLVED"
              ? "good"
              : incident.status === "DISPUTED"
                ? "danger"
                : "warn"
          }
        >
          {t(`statuses.${incident.status}`)}
        </Badge>
      </div>
      <dl className="grid gap-3 rounded-xl border border-sand-200 bg-white p-5 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-sand-600">{t("admin.vehicle")}</dt>
          <dd className="font-medium">
            <Link
              href={`/admin/vehicles/${incident.vehicle.id}`}
              className="text-brand-700 hover:underline"
            >
              {incident.vehicle.make} {incident.vehicle.model} ·{" "}
              {incident.vehicle.registrationNumber}
            </Link>
          </dd>
        </div>
        <div>
          <dt className="text-sand-600">{t("admin.booking")}</dt>
          <dd className="font-medium">
            {incident.booking ? (
              <Link
                href={`/admin/bookings/${incident.booking.id}`}
                className="text-brand-700 hover:underline"
              >
                {incident.booking.reference}
              </Link>
            ) : (
              "—"
            )}
            <span className="block text-xs text-sand-600">
              {incident.booking?.customer.name} {incident.booking?.customer.email}
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-sand-600">{t("occurredAt")}</dt>
          <dd className="font-medium">
            {format.dateTime(incident.occurredAt, "full")}
            <span className="block text-xs text-sand-600">
              {t("admin.reportedBy")}: {incident.reportedBy?.name ?? "—"} ·{" "}
              {format.dateTime(incident.createdAt, "full")}
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-sand-600">{t("location")}</dt>
          <dd className="font-medium">
            {incident.locationDescription ?? "—"}
            <span className="block text-xs text-sand-600">
              {t("policeReport")}: {incident.policeReportNumber ?? "—"}
            </span>
          </dd>
        </div>
        <div className="sm:col-span-2 lg:col-span-4">
          <dt className="text-sand-600">{t("description")}</dt>
          <dd className="whitespace-pre-line">{incident.description}</dd>
        </div>
      </dl>
      {photos.length > 0 ? (
        <section>
          <h2 className="text-lg font-semibold">{t("photos")}</h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {photos.map((p) => (
              <li key={p.key}>
                <a
                  href={p.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-brand-700 underline"
                >
                  {p.key.split("/").pop()}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <IncidentTransitionForm incidentId={incident.id} status={incident.status} />
          {canResolve ? (
            <IncidentResolutionForm
              incidentId={incident.id}
              defaults={{
                repairEstimateXaf: incident.repairEstimateXaf,
                customerLiableXaf: incident.customerLiableXaf,
                depositDeductionXaf: incident.depositDeductionXaf,
                responsibilityNotes: incident.responsibilityNotes,
                resolutionNotes: incident.resolutionNotes,
              }}
            />
          ) : (
            <dl className="rounded-xl border border-sand-200 bg-white p-5 text-sm">
              <dt className="text-sand-600">{t("admin.resolution")}</dt>
              <dd>
                {incident.repairEstimateXaf
                  ? `${t("admin.repairEstimateXaf")}: ${formatXaf(incident.repairEstimateXaf, currentLocale)}`
                  : "—"}
              </dd>
            </dl>
          )}
          {canResolve ? (
            <>
              {incident.claims.map((c) => (
                <InsuranceClaimForm key={c.id} incidentId={incident.id} claim={c} />
              ))}
              <InsuranceClaimForm incidentId={incident.id} />
            </>
          ) : null}
        </div>
        <aside>
          <h2 className="text-lg font-semibold">{t("admin.history")}</h2>
          <ol className="mt-2 space-y-1 text-sm">
            {incident.statusHistory.map((h) => (
              <li key={h.id} className="text-sand-700">
                <span className="font-mono text-xs text-sand-500">
                  {format.dateTime(h.createdAt, "full")}
                </span>{" "}
                · {t(`statuses.${h.toStatus}`)} · {h.actor?.name ?? ""}
                {h.note ? ` · ${h.note}` : ""}
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </div>
  );
}
