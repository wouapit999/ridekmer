import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { LegalPage } from "@/components/layout/legal-page";
import { routing } from "@/i18n/routing";

type Props = { params: Promise<{ locale: string }> };

/**
 * Static marketing/legal page (ADR-033): prerendered per locale through generateStaticParams.
 * Do not add `dynamic = "force-static"`: it made next-intl render the default locale (fr)
 * on the /en pages.
 */

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal.terms" });
  return { title: t("metaTitle") };
}

export default async function Page({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <LegalPage section="terms" />;
}
