import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Alert, Badge } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Container, PageHeader } from "@/components/ui/container";
import { AccountNav } from "@/features/account/account-nav";
import { OwnerActivateButton } from "@/features/account/owner-activate-button";
import { getEnv } from "@/lib/env";
import { enumLabel } from "@/lib/i18n-enum";
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
  const te = await getTranslations("enums");
  const isOwner = access.roles.some((r) => r.key === "vehicle_owner");
  const mfaPending =
    access.requiresMfa && getEnv().AUTH_REQUIRE_STAFF_MFA && !user.twoFactorEnabled;

  return (
    <Container className="py-10">
      <PageHeader title={t("title")} intro={t("welcome", { name: user.name })} />
      <AccountNav current="overview" />
      <div className="mt-6 space-y-4">
        {forbidden ? <Alert tone="danger">{t("forbidden")}</Alert> : null}
        {access.isStaff ? (
          <Card className="border-brand-300 bg-brand-50">
            <CardTitle>{t("staff.title")}</CardTitle>
            {mfaPending ? (
              <>
                <p className="mt-2 text-sm text-sand-800">{t("staff.mfaFirst")}</p>
                <div className="mt-4">
                  <ButtonLink href="/account/security?mfa=required">
                    {t("staff.enableMfa")}
                  </ButtonLink>
                </div>
              </>
            ) : (
              <>
                <p className="mt-2 text-sm text-sand-800">{t("staff.body")}</p>
                <div className="mt-4">
                  <ButtonLink href="/admin">{t("staff.open")}</ButtonLink>
                </div>
              </>
            )}
          </Card>
        ) : null}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardTitle>{t("overview.roles")}</CardTitle>
            <div className="mt-3 flex flex-wrap gap-2">
              {access.roles.map((r) => (
                <Badge key={r.key} tone={r.isStaff ? "brand" : "neutral"}>
                  {enumLabel(te, "role", r.key)}
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
