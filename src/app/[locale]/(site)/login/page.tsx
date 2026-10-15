import type { Metadata } from "next";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";

import { AuthCard } from "@/features/auth/auth-card";
import { LoginForm } from "@/features/auth/login-form";
import { redirect } from "@/i18n/navigation";
import { getEnv } from "@/lib/env";
import { getCurrentSession } from "@/server/auth/session";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ returnTo?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth.login" });
  return { title: t("metaTitle") };
}

export default async function LoginPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { returnTo } = await searchParams;
  if (await getCurrentSession())
    redirect({
      href: returnTo && returnTo.startsWith("/") ? returnTo : "/account",
      locale: await getLocale(),
    });
  const t = await getTranslations("auth.login");
  return (
    <AuthCard title={t("title")} subtitle={t("subtitle")}>
      <LoginForm returnTo={returnTo} smsIsMock={getEnv().SMS_PROVIDER === "log"} />
    </AuthCard>
  );
}
