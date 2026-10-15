import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { BenefitsPage } from "@/components/layout/benefits-page";
import { routing } from "@/i18n/routing";

type Props = { params: Promise<{ locale: string }> };

/** Static marketing/legal page (ADR-033): prerendered per locale, served from the CDN. */
export const dynamic = "force-static";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "longTerm" });
  return { title: t("metaTitle") };
}

export default async function Page({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <BenefitsPage namespace="longTerm" ctaHref="/contact?category=corporate" />;
}
