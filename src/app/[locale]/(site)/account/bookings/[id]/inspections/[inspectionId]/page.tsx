import { getFormatter, getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { Alert, Badge } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Container, PageHeader } from "@/components/ui/container";
import { AccountNav } from "@/features/account/account-nav";
import { DamageDiagram } from "@/features/inspections/damage-diagram";
import { CustomerInspectionDecision } from "@/features/inspections/forms";
import { InspectionError, getInspectionForCustomer } from "@/features/inspections/service";
import type { Settlement } from "@/features/inspections/settlement";
import { formatXaf } from "@/lib/money";
import { requireUser } from "@/server/auth/session";
import { trySignedDownloadUrl } from "@/server/files/service";

export default async function CustomerInspectionPage({
  params,
}: {
  params: Promise<{ locale: string; id: string; inspectionId: string }>;
}) {
  const { locale, id, inspectionId } = await params;
  setRequestLocale(locale);
  const { user } = await requireUser(`/account/bookings/${id}/inspections/${inspectionId}`);
  let inspection: Awaited<ReturnType<typeof getInspectionForCustomer>>;
  try {
    inspection = await getInspectionForCustomer(inspectionId, user.id);
  } catch (error) {
    if (error instanceof InspectionError) notFound();
    throw error;
  }
  if (inspection.booking?.id !== id) notFound();
  const t = await getTranslations("inspections");
  const currentLocale = (await getLocale()) === "en" ? "en" : "fr";
  const format = await getFormatter();
  const photos = await Promise.all(
    inspection.photos.map(async (p) => ({
      ...p,
      url: (await trySignedDownloadUrl({ storageKey: p.storageKey, actorId: user.id })) ?? "",
    })),
  );
  const settlement = inspection.settlement as unknown as Settlement | null;
  return (
    <Container className="py-10">
      <PageHeader
        title={t("customer.pageTitle", {
          type: t(`types.${inspection.type}`),
          reference: inspection.booking.reference,
        })}
      />
      <AccountNav current="bookings" />
      <div className="mt-6 space-y-4">
        <ButtonLink href={`/account/bookings/${id}`} variant="ghost" size="sm">
          ← {t("backToBooking")}
        </ButtonLink>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Badge
            tone={
              inspection.status === "DISPUTED"
                ? "danger"
                : inspection.status === "ACKNOWLEDGED"
                  ? "good"
                  : "warn"
            }
          >
            {t(`statuses.${inspection.status}`)}
          </Badge>
          <span className="text-sand-600">
            {format.dateTime(inspection.performedAt, "full")} · {inspection.inspector?.name ?? ""}
          </span>
        </div>
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
            <dt className="text-sand-600">{t("damagesCount")}</dt>
            <dd className="font-medium">{inspection.damages.length}</dd>
          </div>
          {inspection.notes ? (
            <div className="sm:col-span-3">
              <dt className="text-sand-600">{t("notes")}</dt>
              <dd>{inspection.notes}</dd>
            </div>
          ) : null}
        </dl>
        {inspection.damages.length > 0 ? (
          <section className="grid gap-4 rounded-xl border border-sand-200 bg-white p-5 sm:grid-cols-2">
            <DamageDiagram
              markers={inspection.damages.map((d) => ({
                id: d.id,
                x: d.markerX,
                y: d.markerY,
                severity: d.severity,
                isPreExisting: d.isPreExisting,
              }))}
              label={t("diagramLabel")}
            />
            <ul className="space-y-2 text-sm">
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
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {photos.length > 0 ? (
          <section>
            <h2 className="text-lg font-semibold">{t("photosTitle")}</h2>
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
        ) : null}
        {inspection.type === "RETURN" && settlement ? (
          <section className="rounded-xl border border-sand-200 bg-white p-5 text-sm">
            <h2 className="text-lg font-semibold">{t("settlement.title")}</h2>
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
            <p className="mt-2 text-xs text-sand-600">{t("settlement.customerHint")}</p>
          </section>
        ) : null}
        {inspection.status === "SUBMITTED" ? (
          <CustomerInspectionDecision inspectionId={inspection.id} />
        ) : null}
        {inspection.status === "DISPUTED" ? (
          <Alert tone="warning">
            {t("customer.disputedNotice")}
            {inspection.disputeNote ? ` — ${inspection.disputeNote}` : ""}
          </Alert>
        ) : null}
      </div>
    </Container>
  );
}
