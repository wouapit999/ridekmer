import { getTranslations, setRequestLocale } from "next-intl/server";

import { Alert } from "@/components/ui/alert";
import { Container, PageHeader } from "@/components/ui/container";
import { AccountNav } from "@/features/account/account-nav";
import { MfaSetup } from "@/features/account/mfa-setup";
import { PasswordChange } from "@/features/account/password-change";
import { getEnv } from "@/lib/env";
import { requireUser } from "@/server/auth/session";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ mfa?: string }> };

export default async function SecurityPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { user, access } = await requireUser("/account/security");
  const { mfa } = await searchParams;
  const t = await getTranslations("account");
  const required = (access.requiresMfa && getEnv().AUTH_REQUIRE_STAFF_MFA) || mfa === "required";
  return (
    <Container className="py-10">
      <PageHeader title={t("security.title")} />
      <AccountNav current="security" />
      {access.isStaff && !user.twoFactorEnabled && required ? (
        <div className="mt-6">
          <Alert tone="warning" title={t("security.staffMfaTitle")}>
            <ol className="mt-1 list-decimal space-y-1 pl-5">
              <li>{t("security.staffMfaStep1")}</li>
              <li>{t("security.staffMfaStep2")}</li>
              <li>{t("security.staffMfaStep3")}</li>
              <li>{t("security.staffMfaStep4")}</li>
            </ol>
          </Alert>
        </div>
      ) : null}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <MfaSetup enabled={user.twoFactorEnabled} required={required} isStaff={access.isStaff} />
        <PasswordChange />
      </div>
    </Container>
  );
}
