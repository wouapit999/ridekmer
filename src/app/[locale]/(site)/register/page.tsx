import type { Metadata } from "next";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";

import { AuthCard } from "@/features/auth/auth-card";
import { RegisterForm } from "@/features/auth/register-form";
import { redirect } from "@/i18n/navigation";
import { getCurrentSession } from "@/server/auth/session";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ intent?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth.register" });
  return { title: t("metaTitle") };
}

export default async function RegisterPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { intent } = await searchParams;
  if (await getCurrentSession()) redirect({ href: "/account", locale: await getLocale() });
  const t = await getTranslations("auth.register");
  return (
    <AuthCard title={t("title")} subtitle={t("subtitle")}>
      <RegisterForm intent={intent} />
    </AuthCard>
  );
}
