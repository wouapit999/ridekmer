import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Alert } from "@/components/ui/alert";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Container, PageHeader } from "@/components/ui/container";
import { AccountNav } from "@/features/account/account-nav";
import { CancelDeletionForm, DeletionRequestForm } from "@/features/account/privacy-forms";
import { deletionGraceDays, openDeletionRequest } from "@/features/account/privacy";
import { formatIsoDate } from "@/lib/dates";
import { requireUser } from "@/server/auth/session";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "account.privacy" });
  return { title: t("title") };
}

export default async function PrivacyPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { user } = await requireUser("/account/privacy");
  const t = await getTranslations("account.privacy");
  const [pending, graceDays] = await Promise.all([
    openDeletionRequest(user.id),
    deletionGraceDays(),
  ]);

  return (
    <Container className="py-10">
      <PageHeader title={t("title")} intro={t("intro")} />
      <AccountNav current="privacy" />
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle>{t("exportTitle")}</CardTitle>
          <p className="mt-2 text-sm text-sand-700">{t("exportBody")}</p>
          <div className="mt-4">
            <a href="/api/account/export" download className={buttonClasses("outline")}>
              {t("exportButton")}
            </a>
          </div>
        </Card>
        <Card>
          <CardTitle>{pending ? t("pendingTitle") : t("deleteTitle")}</CardTitle>
          <div className="mt-2">
            {pending ? (
              <CancelDeletionForm requestedAt={formatIsoDate(pending.createdAt)} />
            ) : (
              <DeletionRequestForm graceDays={graceDays} />
            )}
          </div>
        </Card>
      </div>
      <div className="mt-6">
        <Alert tone="warning">{t("legalNote")}</Alert>
      </div>
    </Container>
  );
}
