import { getFormatter, getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { Alert, Badge } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { Container, PageHeader } from "@/components/ui/container";
import { DocumentExpiry, DocumentStatusBadge } from "@/features/documents/document-badge";
import { FileLink } from "@/features/documents/file-link";
import { requireOwnerPage } from "@/features/owner/guards";
import { OwnerNav } from "@/features/owner/owner-nav";
import { removeBlockAction } from "@/features/vehicles/actions";
import { VehicleError, getOwnedVehicle } from "@/features/vehicles/service";
import { BlockDatesForm, OwnerRequestForm } from "@/features/vehicles/wizard-forms";
import { formatXaf } from "@/lib/money";

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

export default async function OwnerVehicleDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const { user } = await requireOwnerPage(`/owner/vehicles/${id}`);
  const t = await getTranslations("owner");
  const currentLocale = (await getLocale()) === "en" ? "en" : "fr";
  const format = await getFormatter();
  let data: Awaited<ReturnType<typeof getOwnedVehicle>>;
  try {
    data = await getOwnedVehicle(id, user.id);
  } catch (error) {
    if (error instanceof VehicleError) notFound();
    throw error;
  }
  const { vehicle } = data;
  const canRequest = ["ACTIVE", "APPROVED", "SUSPENDED", "UNAVAILABLE_DOCUMENTS"].includes(
    vehicle.status,
  );
  return (
    <Container className="py-10">
      <PageHeader title={`${vehicle.make} ${vehicle.model}`} intro={vehicle.registrationNumber} />
      <OwnerNav current="vehicles" />
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={TONE[vehicle.status]}>{t(`vehicles.status.${vehicle.status}`)}</Badge>
            <span
              className={
                vehicle.documentsValid ? "text-sm text-success-600" : "text-sm text-accent-700"
              }
            >
              {vehicle.documentsValid
                ? t("vehicles.documentsValid")
                : t("vehicles.documentsInvalid")}
            </span>
            {["DRAFT", "REJECTED"].includes(vehicle.status) ? (
              <ButtonLink href={`/owner/vehicles/${vehicle.id}/edit`} size="sm" variant="outline">
                {t("detail.edit")}
              </ButtonLink>
            ) : null}
          </div>
          {vehicle.rejectionReason ? (
            <Alert tone="danger" title={t("detail.rejectionReason")}>
              {vehicle.rejectionReason}
            </Alert>
          ) : null}
          {vehicle.suspensionReason ? (
            <Alert tone="warning" title={t("detail.suspensionReason")}>
              {vehicle.suspensionReason}
            </Alert>
          ) : null}
          {vehicle.ownerRequestType ? (
            <Alert tone="info">
              {t("detail.requestPending", {
                type:
                  vehicle.ownerRequestType === "SUSPENSION"
                    ? t("detail.requestSuspension")
                    : t("detail.requestWithdrawal"),
                date: format.dateTime(vehicle.ownerRequestedAt ?? new Date(), "short"),
              })}
            </Alert>
          ) : null}
          <dl className="grid gap-3 rounded-xl border border-sand-200 bg-white p-5 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-sand-600">{t("wizard.pricing.dailyPriceXaf")}</dt>
              <dd className="font-medium">{formatXaf(vehicle.dailyPriceXaf, currentLocale)}</dd>
            </div>
            <div>
              <dt className="text-sand-600">{t("wizard.pricing.securityDepositXaf")}</dt>
              <dd className="font-medium">
                {formatXaf(vehicle.securityDepositXaf, currentLocale)}
              </dd>
            </div>
            <div>
              <dt className="text-sand-600">{t("wizard.arrangement.ownershipModel")}</dt>
              <dd className="font-medium">
                {vehicle.ownershipModel === "SELF_MANAGED_MARKETPLACE_VEHICLE"
                  ? t("wizard.arrangement.SELF_MANAGED_MARKETPLACE_VEHICLE")
                  : t("wizard.arrangement.FULLY_MANAGED_OWNER_VEHICLE")}
              </dd>
            </div>
          </dl>
          <section>
            <h2 className="text-lg font-semibold">{t("detail.documents")}</h2>
            <ul className="mt-2 divide-y divide-sand-200 rounded-xl border border-sand-200 bg-white">
              {vehicle.documents.map((d) => (
                <li
                  key={d.id}
                  className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm"
                >
                  <div>
                    <p className="font-medium">
                      {currentLocale === "en" ? d.documentType.nameEn : d.documentType.nameFr}
                    </p>
                    <p className="text-sand-600">
                      <DocumentExpiry expiryDate={d.expiryDate} status={d.status} />
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
                    />
                  </div>
                </li>
              ))}
            </ul>
            <ButtonLink
              href={`/owner/vehicles/${vehicle.id}/edit?step=documents`}
              variant="ghost"
              size="sm"
              className="mt-2"
            >
              {t("wizard.steps.documents")} →
            </ButtonLink>
          </section>
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">{t("detail.availability")}</h2>
            {vehicle.availabilityBlocks.length === 0 ? (
              <p className="text-sm text-sand-600">{t("detail.noBlocks")}</p>
            ) : null}
            <ul className="space-y-2">
              {vehicle.availabilityBlocks.map((b) => (
                <li
                  key={b.id}
                  className="flex items-center justify-between rounded-lg border border-sand-200 bg-white px-4 py-2 text-sm"
                >
                  <span>
                    {format.dateTime(b.startAt, "short")} →{" "}
                    {format.dateTime(new Date(b.endAt.getTime() - 1), "short")}{" "}
                    {b.reason ? `· ${b.reason}` : ""} <Badge>{b.type}</Badge>
                  </span>
                  {b.type === "OWNER_BLOCK" ? (
                    <form action={removeBlockAction}>
                      <input type="hidden" name="vehicleId" value={vehicle.id} />
                      <input type="hidden" name="blockId" value={b.id} />
                      <Button type="submit" variant="ghost" size="sm">
                        {t("detail.removeBlock")}
                      </Button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
            <BlockDatesForm vehicleId={vehicle.id} />
          </section>
        </div>
        <aside className="space-y-4">
          {canRequest && !vehicle.ownerRequestType ? (
            <OwnerRequestForm vehicleId={vehicle.id} />
          ) : null}
        </aside>
      </div>
    </Container>
  );
}
