import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Alert, Badge } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Container, PageHeader } from "@/components/ui/container";
import { OwnerNav } from "@/features/owner/owner-nav";
import { requireOwnerPage } from "@/features/owner/guards";
import { listOwnerVehicles } from "@/features/vehicles/service";
import { Link } from "@/i18n/navigation";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "owner" });
  return { title: t("metaTitle") };
}

export default async function OwnerPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { user, profile } = await requireOwnerPage("/owner");
  const t = await getTranslations("owner");
  const vehicles = await listOwnerVehicles(user.id);
  const kycCase = profile.verificationCases[0];
  return (
    <Container className="py-10">
      <PageHeader title={t("title")} intro={profile.displayName} />
      <OwnerNav current="overview" />
      <div className="mt-6 space-y-4">
        {!profile.onboardingComplete ? (
          <Alert tone="warning">
            {t("status.onboardingIncomplete")}{" "}
            <Link href="/owner/onboarding" className="font-medium underline">
              →
            </Link>
          </Alert>
        ) : null}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardTitle>{t("steps.documents")}</CardTitle>
            <p className="mt-2 text-sm text-sand-700">
              {profile.kycApprovedAt
                ? t("status.kycApproved")
                : kycCase?.status === "SUBMITTED" || kycCase?.status === "UNDER_REVIEW"
                  ? t("status.kycPending")
                  : t("status.onboardingIncomplete")}
            </p>
          </Card>
          <Card>
            <CardTitle>{t("steps.agreement")}</CardTitle>
            <p className="mt-2 text-sm text-sand-700">
              {profile.agreementAcceptedAt
                ? t("agreement.accepted", {
                    date: profile.agreementAcceptedAt.toISOString().slice(0, 10),
                  })
                : t("status.agreementPending")}
            </p>
          </Card>
          <Card>
            <CardTitle>{t("vehicles.title")}</CardTitle>
            <p className="mt-2 text-sm text-sand-700">{vehicles.length}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {vehicles.slice(0, 5).map((v) => (
                <Badge key={v.id}>{v.registrationNumber}</Badge>
              ))}
            </div>
          </Card>
        </div>
        <div className="flex flex-wrap gap-3">
          <ButtonLink href="/owner/vehicles/new">{t("vehicles.add")}</ButtonLink>
          <ButtonLink href="/owner/vehicles" variant="outline">
            {t("nav.vehicles")}
          </ButtonLink>
        </div>
      </div>
    </Container>
  );
}
