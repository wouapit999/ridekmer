import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Container } from "@/components/ui/container";
import { OfflineRetry } from "@/components/pwa/offline-retry";
import { routing } from "@/i18n/routing";

type Props = { params: Promise<{ locale: string }> };

export const dynamic = "force-static";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "errors" });
  return { title: t("offlineTitle"), robots: { index: false } };
}

/** Served by the service worker when a navigation fails without connectivity (ADR-034). */
export default async function OfflinePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("errors");
  return (
    <Container className="py-24 text-center">
      <h1 className="text-3xl font-bold text-sand-900">{t("offlineTitle")}</h1>
      <p className="mt-3 text-sand-700">{t("offlineBody")}</p>
      <div className="mt-8">
        <OfflineRetry label={t("offlineRetry")} />
      </div>
    </Container>
  );
}
