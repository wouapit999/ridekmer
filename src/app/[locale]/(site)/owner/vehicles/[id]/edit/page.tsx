import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Container, PageHeader } from "@/components/ui/container";
import { DocumentExpiry, DocumentStatusBadge } from "@/features/documents/document-badge";
import { FileLink } from "@/features/documents/file-link";
import { DocumentUploadForm } from "@/features/documents/upload-form";
import { requireOwnerPage } from "@/features/owner/guards";
import { OwnerNav } from "@/features/owner/owner-nav";
import { removeImageAction, uploadVehicleDocumentAction } from "@/features/vehicles/actions";
import { ONBOARDING_STEPS, type OnboardingStep } from "@/features/vehicles/schemas";
import { VehicleError, getOwnedVehicle } from "@/features/vehicles/service";
import {
  ArrangementForm,
  BasicsForm,
  EquipmentForm,
  LocationForm,
  PhotosForm,
  PricingForm,
  SubmitForm,
} from "@/features/vehicles/wizard-forms";
import { Link } from "@/i18n/navigation";
import { getEnv } from "@/lib/env";
import { formatXaf } from "@/lib/money";
import { db } from "@/server/db";

type Props = {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ step?: string }>;
};

export default async function EditVehiclePage({ params, searchParams }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const { user } = await requireOwnerPage(`/owner/vehicles/${id}/edit`);
  const { step: requested } = await searchParams;
  const t = await getTranslations("owner.wizard");
  const tv = await getTranslations("owner.vehicles");
  const currentLocale = (await getLocale()) === "en" ? "en" : "fr";
  let data: Awaited<ReturnType<typeof getOwnedVehicle>>;
  try {
    data = await getOwnedVehicle(id, user.id);
  } catch (error) {
    if (error instanceof VehicleError) notFound();
    throw error;
  }
  const { vehicle } = data;
  const editable = ["DRAFT", "REJECTED"].includes(vehicle.status);
  const step: OnboardingStep = ONBOARDING_STEPS.includes(requested as OnboardingStep)
    ? (requested as OnboardingStep)
    : (vehicle.onboardingStep as OnboardingStep);
  const stepIndex = ONBOARDING_STEPS.indexOf(step);
  const [cities, branches, docTypes] = await Promise.all([
    db.city.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    db.branch.findMany({ where: { cityId: vehicle.cityId, isActive: true } }),
    db.documentType.findMany({
      where: {
        subjectType: "VEHICLE",
        isActive: true,
        key: { not: "vehicle_management_agreement" },
      },
      orderBy: { sortOrder: "asc" },
    }),
  ]);
  const name = (o: { nameFr: string; nameEn: string }) =>
    currentLocale === "en" ? o.nameEn : o.nameFr;
  const maxMb = Math.round(getEnv().STORAGE_MAX_FILE_SIZE_BYTES / 1024 / 1024);
  const plain = JSON.parse(JSON.stringify(vehicle)) as Record<string, unknown> & {
    id: string;
    safetyEquipment: string[];
    ownershipModel: string;
    managementConfig: Record<string, unknown> | null;
  };

  return (
    <Container className="py-10">
      <PageHeader
        title={`${vehicle.make} ${vehicle.model} · ${vehicle.registrationNumber}`}
        intro={t("step", { current: stepIndex + 1, total: ONBOARDING_STEPS.length })}
      />
      <OwnerNav current="vehicles" />
      {!editable ? (
        <Alert tone="info" className="mt-6">
          {tv(`status.${vehicle.status}`)}
        </Alert>
      ) : null}
      {vehicle.status === "REJECTED" && vehicle.rejectionReason ? (
        <Alert tone="danger" className="mt-4">
          {vehicle.rejectionReason}
        </Alert>
      ) : null}
      <ol className="mt-6 flex flex-wrap gap-2" aria-label="Steps">
        {ONBOARDING_STEPS.map((s, i) => (
          <li key={s}>
            <Link
              href={`/owner/vehicles/${vehicle.id}/edit?step=${s}`}
              aria-current={s === step ? "step" : undefined}
              className={
                s === step
                  ? "rounded-full bg-brand-600 px-3 py-1 text-sm font-semibold text-white"
                  : "rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-700"
              }
            >
              {i + 1}. {t(`steps.${s}`)}
            </Link>
          </li>
        ))}
      </ol>
      <div className="mt-6 max-w-3xl space-y-6">
        {step === "basics" && editable ? (
          <BasicsForm vehicle={plain} cities={cities.map((c) => ({ id: c.id, name: name(c) }))} />
        ) : null}
        {step === "equipment" && editable ? <EquipmentForm vehicle={plain} /> : null}
        {step === "location" && editable ? (
          <LocationForm
            vehicle={plain}
            branches={branches.map((b) => ({ id: b.id, name: name(b) }))}
          />
        ) : null}
        {step === "pricing" && editable ? <PricingForm vehicle={plain} /> : null}
        {step === "photos" ? (
          <>
            <PhotosForm vehicleId={vehicle.id} />
            <p className="text-sm text-sand-600">
              {t("photos.count", { count: vehicle.images.length })}
            </p>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {vehicle.images.map((img) => (
                <li
                  key={img.id}
                  className="space-y-2 rounded-lg border border-sand-200 bg-white p-2 text-xs"
                >
                  <FileLink
                    storageKey={img.storageKey}
                    label={img.isPrimary ? `★ ${t("photos.primary")}` : t("photos.files")}
                    actorId={user.id}
                  />
                  <form action={removeImageAction}>
                    <input type="hidden" name="vehicleId" value={vehicle.id} />
                    <input type="hidden" name="imageId" value={img.id} />
                    <Button type="submit" variant="ghost" size="sm">
                      {t("photos.remove")}
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
            {editable ? (
              <Link
                href={`/owner/vehicles/${vehicle.id}/edit?step=documents`}
                className="inline-block font-medium text-brand-700 hover:underline"
              >
                {t("saveContinue")} →
              </Link>
            ) : null}
          </>
        ) : null}
        {step === "documents" ? (
          <>
            <p className="text-sand-700">{t("documents.intro")}</p>
            <DocumentUploadForm
              action={uploadVehicleDocumentAction}
              hidden={{ vehicleId: vehicle.id }}
              types={docTypes.map((d) => ({
                key: d.key,
                name: name(d),
                isMandatory: d.isMandatory,
                requiresExpiry: d.requiresExpiry,
                requiresNumber: d.requiresNumber,
              }))}
              maxMb={maxMb}
            />
            <ul className="divide-y divide-sand-200 rounded-xl border border-sand-200 bg-white">
              {docTypes.map((type) => {
                const doc = vehicle.documents.find((d) => d.documentTypeId === type.id);
                return (
                  <li
                    key={type.id}
                    className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm"
                  >
                    <div>
                      <p className="font-medium">
                        {name(type)}{" "}
                        {type.isMandatory ? <span className="text-danger-700">*</span> : null}
                      </p>
                      {doc ? (
                        <p className="text-sand-600">
                          <DocumentExpiry expiryDate={doc.expiryDate} status={doc.status} />
                          {doc.rejectionReason ? ` · ${doc.rejectionReason}` : ""}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-3">
                      {doc ? (
                        <DocumentStatusBadge status={doc.status} />
                      ) : (
                        <span className="text-sand-500">—</span>
                      )}
                      {doc ? (
                        <FileLink
                          storageKey={doc.storageKey}
                          fileName={doc.fileName}
                          label={t("photos.files") === "" ? "" : "↗"}
                          actorId={user.id}
                        />
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
            {editable ? (
              <Link
                href={`/owner/vehicles/${vehicle.id}/edit?step=arrangement`}
                className="inline-block font-medium text-brand-700 hover:underline"
              >
                {t("saveContinue")} →
              </Link>
            ) : null}
          </>
        ) : null}
        {step === "arrangement" && editable ? <ArrangementForm vehicle={plain} /> : null}
        {step === "review" ? (
          <>
            <p className="text-sand-700">{t("review.intro")}</p>
            <dl className="grid gap-3 rounded-xl border border-sand-200 bg-white p-5 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-sand-600">{t("steps.pricing")}</dt>
                <dd className="font-medium">
                  {vehicle.dailyPriceXaf > 0
                    ? formatXaf(vehicle.dailyPriceXaf, currentLocale)
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-sand-600">{t("steps.photos")}</dt>
                <dd className="font-medium">{vehicle.images.length}</dd>
              </div>
              <div>
                <dt className="text-sand-600">{t("steps.documents")}</dt>
                <dd className="font-medium">{vehicle.documents.length}</dd>
              </div>
              <div>
                <dt className="text-sand-600">{t("steps.arrangement")}</dt>
                <dd className="font-medium">
                  {vehicle.managementConfig
                    ? t(
                        `arrangement.${vehicle.ownershipModel === "SELF_MANAGED_MARKETPLACE_VEHICLE" ? "SELF_MANAGED_MARKETPLACE_VEHICLE" : "FULLY_MANAGED_OWNER_VEHICLE"}`,
                      )
                    : "—"}
                </dd>
              </div>
            </dl>
            {editable ? <SubmitForm vehicleId={vehicle.id} /> : null}
          </>
        ) : null}
      </div>
    </Container>
  );
}
