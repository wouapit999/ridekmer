import { getTranslations, setRequestLocale } from "next-intl/server";

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
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <MfaSetup enabled={user.twoFactorEnabled} required={required} />
        <PasswordChange />
      </div>
    </Container>
  );
}
