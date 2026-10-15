import { getFormatter, getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { Alert, Badge } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { removeDamageAction } from "@/features/inspections/actions";
import { DamageDiagram } from "@/features/inspections/damage-diagram";
import {
  DamageForm,
  InspectionDetailsForm,
  InspectionPhotoForm,
  SubmitInspectionForm,
} from "@/features/inspections/forms";
import type { CheckGroup } from "@/features/inspections/schemas";
import { getInspectionForStaff } from "@/features/inspections/service";
import type { Settlement } from "@/features/inspections/settlement";
import { Link } from "@/i18n/navigation";
import { formatXaf } from "@/lib/money";
import { requirePermission } from "@/server/auth/session";
import { signedDownloadUrl } from "@/server/files/service";

const REQUIRED_PHOTOS = 4;

export default async function AdminInspectionPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const { user, access } = await requirePermission(
    "inspection.view_all",
    `/admin/inspections/${id}`,
  );
  const inspection = await getInspectionForStaff(id);
  if (!inspection) notFound();
  const t = await getTranslations("inspections");
  const currentLocale = (await getLocale()) === "en" ? "en" : "fr";
  const format = await getFormatter();
  const canPerform = access.permissions.has("inspection.perform") && inspection.status === "DRAFT";
  const photos = await Promise.all(
    inspection.photos.map(async (p) => ({
      ...p,
      url: await signedDownloadUrl({ storageKey: p.storageKey, actorId: user.id }),
    })),
  );
  const checks: Partial<Record<CheckGroup, Record<string, string>>> = {
    exterior: (inspection.exteriorCondition as Record<string, string>) ?? {},
    interior: (inspection.interiorCondition as Record<string, string>) ?? {},
    tyres: (inspection.tyresCondition as Record<string, string>) ?? {},
    lights: (inspection.lightsCondition as Record<string, string>) ?? {},
  };
  const markers = inspection.damages.map((d) => ({
    id: d.id,
    x: d.markerX,
    y: d.markerY,
    severity: d.severity,
    isPreExisting: d.isPreExisting,
  }));
  const settlement = inspection.settlement as unknown as Settlement | null;
  const ready =
    inspection.mileageKm !== null &&
    inspection.fuelLevelPercent !== null &&
    inspection.photos.length >= REQUIRED_PHOTOS;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-sand-900">
            {t(`types.${inspection.type}`)} · {inspection.vehicle.make} {inspection.vehicle.model} ·{" "}
            {inspection.vehicle.registrationNumber}
          </h1>
          <p className="text-sm text-sand-600">
            {inspection.booking ? (
              <Link
                href={`/admin/bookings/${inspection.booking.id}`}
                className="text-brand-700 hover:underline"
              >
                {inspection.booking.reference}
              </Link>
            ) : (
              <Link
                href={`/admin/vehicles/${inspection.vehicle.id}`}
                className="text-brand-700 hover:underline"
              >
                {t("vehicleLink")}
              </Link>
            )}{" "}
            · {format.dateTime(inspection.performedAt, "full")} · {inspection.inspector?.name ?? ""}
          </p>
        </div>
        <Badge
          tone={
            inspection.status === "DRAFT"
              ? "warn"
              : inspection.status === "DISPUTED"
                ? "danger"
                : "good"
          }
        >
          {t(`statuses.${inspection.status}`)}
        </Badge>
      </div>
      {inspection.status !== "DRAFT" ? <Alert tone="info">{t("frozen")}</Alert> : null}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {canPerform ? (
            <InspectionDetailsForm
              inspectionId={inspection.id}
              defaults={{
                mileageKm: inspection.mileageKm,
                fuelLevelPercent: inspection.fuelLevelPercent,
                windscreenCondition: inspection.windscreenCondition,
                notes: inspection.notes,
              }}
              checks={checks}
            />
          ) : (
            <dl className="grid gap-3 rounded-xl border border-sand-200 bg-white p-5 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-sand-600">{t("mileageKm")}</dt>
                <dd className="font-medium">{inspection.mileageKm ?? "—"} km</dd>
              </div>
              <div>
                <dt className="text-sand-600">{t("fuelLevelPercent")}</dt>
                <dd className="font-medium">{inspection.fuelLevelPercent ?? "—"} %</dd>
              </div>
              <div>
                <dt className="text-sand-600">{t("windscreen")}</dt>
                <dd className="font-medium">{inspection.windscreenCondition ?? "—"}</dd>
              </div>
              {inspection.notes ? (
                <div className="sm:col-span-3">
                  <dt className="text-sand-600">{t("notes")}</dt>
                  <dd>{inspection.notes}</dd>
                </div>
              ) : null}
              {inspection.disputeNote ? (
                <div className="sm:col-span-3">
                  <dt className="text-danger-700">{t("customer.disputeNote")}</dt>
                  <dd>{inspection.disputeNote}</dd>
                </div>
              ) : null}
            </dl>
          )}
          {canPerform ? (
            <InspectionPhotoForm
              inspectionId={inspection.id}
              count={inspection.photos.length}
              required={REQUIRED_PHOTOS}
            />
          ) : null}
          <section>
            <h2 className="text-lg font-semibold">
              {t("photosTitle")} ({photos.length})
            </h2>
            <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {photos.map((p) => (
                <li key={p.id}>
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="block overflow-hidden rounded-lg border border-sand-200"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.url}
                      alt={p.area ?? "photo"}
                      className="aspect-square w-full object-cover"
                      loading="lazy"
                    />
                  </a>
                  <p className="mt-1 text-xs text-sand-600">
                    {p.area ? t(`photoAreas.${p.area}` as "photoAreas.other") : ""}
                  </p>
                </li>
              ))}
            </ul>
          </section>
          {canPerform ? (
            <DamageForm
              inspectionId={inspection.id}
              markers={markers}
              isPickup={inspection.type === "PICKUP"}
            />
          ) : null}
          {canPerform ? <SubmitInspectionForm inspectionId={inspection.id} ready={ready} /> : null}
        </div>
        <aside className="space-y-4">
          <section className="rounded-xl border border-sand-200 bg-white p-5">
            <h2 className="font-semibold">
              {t("damages")} ({inspection.damages.length})
            </h2>
            {!canPerform ? <DamageDiagram markers={markers} label={t("diagramLabel")} /> : null}
            <ul className="mt-2 space-y-2 text-sm">
              {inspection.damages.map((d) => (
                <li key={d.id} className="rounded-md border border-sand-200 px-3 py-2">
                  <span className="font-medium">
                    {t(`damageAreas.${d.area}` as "damageAreas.other")}
                  </span>{" "}
                  · {t(`damageTypes.${d.damageType}` as "damageTypes.other")} ·{" "}
                  {t(`severities.${d.severity}`)}
                  {d.isPreExisting ? <Badge>{t("preExisting")}</Badge> : null}
                  {d.estimateXaf ? (
                    <span className="block text-sand-600">
                      {formatXaf(d.estimateXaf, currentLocale)}
                    </span>
                  ) : null}
                  {d.description ? (
                    <span className="block text-sand-600">{d.description}</span>
                  ) : null}
                  {canPerform ? (
                    <form action={removeDamageAction} className="mt-1">
                      <input type="hidden" name="damageId" value={d.id} />
                      <Button type="submit" variant="ghost" size="sm">
                        {t("removeDamage")}
                      </Button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
          {inspection.type === "RETURN" && settlement ? (
            <section className="rounded-xl border border-sand-200 bg-white p-5 text-sm">
              <h2 className="font-semibold">{t("settlement.title")}</h2>
              <ul className="mt-2 space-y-1">
                {settlement.lines.map((l) => (
                  <li key={l.key} className="flex justify-between">
                    <span>
                      {t(`settlement.lines.${l.key}`)}{" "}
                      <span className="text-sand-500">({l.detail})</span>
                    </span>
                    <span>{formatXaf(l.amountXaf, currentLocale)}</span>
                  </li>
                ))}
                <li className="flex justify-between border-t border-sand-200 pt-1 font-semibold">
                  <span>{t("settlement.deduction")}</span>
                  <span>{formatXaf(settlement.deductionXaf, currentLocale)}</span>
                </li>
                <li className="flex justify-between">
                  <span>{t("settlement.depositRefund")}</span>
                  <span>{formatXaf(settlement.depositRefundXaf, currentLocale)}</span>
                </li>
                {settlement.additionalChargeXaf > 0 ? (
                  <li className="flex justify-between text-danger-700">
                    <span>{t("settlement.additionalCharge")}</span>
                    <span>{formatXaf(settlement.additionalChargeXaf, currentLocale)}</span>
                  </li>
                ) : null}
              </ul>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
