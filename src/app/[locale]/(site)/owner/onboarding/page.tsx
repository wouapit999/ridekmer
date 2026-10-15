import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";

import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { Container, PageHeader } from "@/components/ui/container";
import { DocumentExpiry, DocumentStatusBadge } from "@/features/documents/document-badge";
import { DocumentUploadForm } from "@/features/documents/upload-form";
import { FileLink } from "@/features/documents/file-link";
import { completeOwnerDocumentsAction, uploadOwnerDocumentAction } from "@/features/owner/actions";
import { requireOwnerPage } from "@/features/owner/guards";
import { AgreementForm, OwnerProfileForm, PayoutForm } from "@/features/owner/onboarding-forms";
import { OwnerNav } from "@/features/owner/owner-nav";
import { OWNER_STEPS, type OwnerStep } from "@/features/owner/schemas";
import { previewOwnerAgreement } from "@/features/owner/service";
import { Link } from "@/i18n/navigation";
import { getEnv } from "@/lib/env";
import { db } from "@/server/db";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ step?: string }> };

export default async function OwnerOnboardingPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { user, profile } = await requireOwnerPage("/owner/onboarding");
  const { step: requested } = await searchParams;
  const t = await getTranslations("owner");
  const currentLocale = (await getLocale()) === "en" ? "en" : "fr";
  const step: OwnerStep = OWNER_STEPS.includes(requested as OwnerStep)
    ? (requested as OwnerStep)
    : (profile.onboardingStep as OwnerStep);
  const reached = OWNER_STEPS.indexOf(profile.onboardingStep as OwnerStep);

  const subject = profile.ownerType === "COMPANY" ? ["OWNER", "COMPANY"] : ["OWNER"];
  const docTypes = await db.documentType.findMany({
    where: { subjectType: { in: subject as ("OWNER" | "COMPANY")[] }, isActive: true },
    orderBy: { sortOrder: "asc" },
  });
  const kycDocs = profile.verificationCases.flatMap((c) => c.documents);
  const maxMb = Math.round(getEnv().STORAGE_MAX_FILE_SIZE_BYTES / 1024 / 1024);

  return (
    <Container className="py-10">
      <PageHeader title={t("nav.onboarding")} />
      <OwnerNav current="onboarding" />
      <ol className="mt-6 flex flex-wrap gap-2" aria-label="Steps">
        {OWNER_STEPS.map((s, i) => (
          <li key={s}>
            <Link
              href={`/owner/onboarding?step=${s}`}
              aria-current={s === step ? "step" : undefined}
              className={
                s === step
                  ? "rounded-full bg-brand-600 px-3 py-1 text-sm font-semibold text-white"
                  : i <= reached
                    ? "rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-700"
                    : "rounded-full bg-sand-100 px-3 py-1 text-sm text-sand-500"
              }
            >
              {i + 1}. {t(`steps.${s}`)}
            </Link>
          </li>
        ))}
      </ol>
      <div className="mt-6 max-w-3xl space-y-6">
        {step === "profile" ? <OwnerProfileForm profile={profile} /> : null}
        {step === "payout" ? <PayoutForm profile={profile} /> : null}
        {step === "documents" ? (
          <>
            <p className="text-sand-700">{t("documents.intro")}</p>
            <DocumentUploadForm
              action={uploadOwnerDocumentAction}
              types={docTypes.map((d) => ({
                key: d.key,
                name: currentLocale === "en" ? d.nameEn : d.nameFr,
                isMandatory: d.isMandatory,
                requiresExpiry: d.requiresExpiry,
                requiresNumber: d.requiresNumber,
              }))}
              maxMb={maxMb}
            />
            <section>
              <h2 className="text-lg font-semibold">{t("documents.current")}</h2>
              {kycDocs.length === 0 ? (
                <p className="mt-2 text-sm text-sand-600">{t("documents.none")}</p>
              ) : null}
              <ul className="mt-2 divide-y divide-sand-200 rounded-xl border border-sand-200 bg-white">
                {kycDocs.map((d) => (
                  <li
                    key={d.id}
                    className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm"
                  >
                    <div>
                      <p className="font-medium">
                        {currentLocale === "en" ? d.documentType.nameEn : d.documentType.nameFr}{" "}
                        <span className="text-sand-500">
                          {t("documents.version", { version: d.version })}
                        </span>
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
                        label={t("documents.download")}
                        actorId={user.id}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
            <form action={completeOwnerDocumentsAction}>
              <Button type="submit" variant="outline">
                {t("documents.continue")}
              </Button>
            </form>
          </>
        ) : null}
        {step === "agreement" ? (
          <AgreementStep
            userId={user.id}
            locale={currentLocale}
            accepted={profile.agreementAcceptedAt}
          />
        ) : null}
        {step === "vehicles" ? (
          <>
            <Alert tone="success">
              {t("agreement.accepted", {
                date: profile.agreementAcceptedAt?.toISOString().slice(0, 10) ?? "",
              })}
            </Alert>
            <ButtonLink href="/owner/vehicles/new">{t("vehicles.add")}</ButtonLink>
          </>
        ) : null}
      </div>
    </Container>
  );
}

async function AgreementStep({
  userId,
  locale,
  accepted,
}: {
  userId: string;
  locale: "fr" | "en";
  accepted: Date | null;
}) {
  const t = await getTranslations("owner.agreement");
  if (accepted) {
    return (
      <div className="space-y-4">
        <Alert tone="success">{t("accepted", { date: accepted.toISOString().slice(0, 10) })}</Alert>
        <ButtonLink href="/owner/vehicles/new">→</ButtonLink>
      </div>
    );
  }
  const preview = await previewOwnerAgreement(userId, locale);
  return (
    <AgreementForm
      markdown={preview.rendered.markdown}
      checksum={preview.rendered.checksumSha256}
    />
  );
}
