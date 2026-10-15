import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { BenefitsPage } from "@/components/layout/benefits-page";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "chauffeur" });
  return { title: t("metaTitle") };
}

export default async function Page({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <BenefitsPage namespace="chauffeur" ctaHref="/cars?drive=chauffeur" />;
}
