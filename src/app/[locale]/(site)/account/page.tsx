import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Alert, Badge } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Container, PageHeader } from "@/components/ui/container";
import { AccountNav } from "@/features/account/account-nav";
import { OwnerActivateButton } from "@/features/account/owner-activate-button";
import { requireUser } from "@/server/auth/session";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ forbidden?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "account" });
  return { title: t("metaTitle") };
}

export default async function AccountPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { user, access } = await requireUser("/account");
  const { forbidden } = await searchParams;
  const t = await getTranslations("account");
  const isOwner = access.roles.some((r) => r.key === "vehicle_owner");

  return (
    <Container className="py-10">
      <PageHeader title={t("title")} intro={t("welcome", { name: user.name })} />
      <AccountNav current="overview" />
      <div className="mt-6 space-y-4">
        {forbidden ? <Alert tone="danger">{t("forbidden")}</Alert> : null}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardTitle>{t("overview.roles")}</CardTitle>
            <div className="mt-3 flex flex-wrap gap-2">
              {access.roles.map((r) => (
                <Badge key={r.key} tone={r.isStaff ? "brand" : "neutral"}>
                  {r.key}
                </Badge>
              ))}
            </div>
          </Card>
          <Card>
            <CardTitle>{t("overview.verification")}</CardTitle>
            <p className="mt-2 text-sm text-sand-700">{t("overview.verificationPending")}</p>
          </Card>
          <Card>
            <CardTitle>{t("overview.nextSteps")}</CardTitle>
            <p className="mt-2 text-sm text-sand-700">{t("overview.bookingsSoon")}</p>
          </Card>
          <Card>
            <CardTitle>{t("overview.becomeOwner")}</CardTitle>
            <p className="mt-2 text-sm text-sand-700">{t("overview.becomeOwnerBody")}</p>
            <div className="mt-4">
              {isOwner ? (
                <ButtonLink href="/owner" variant="outline">
                  {t("overview.ownerSpace")}
                </ButtonLink>
              ) : (
                <OwnerActivateButton />
              )}
            </div>
          </Card>
        </div>
      </div>
    </Container>
  );
}
