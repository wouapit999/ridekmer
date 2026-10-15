import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Alert } from "@/components/ui/alert";
import { Container, PageHeader } from "@/components/ui/container";
import { routing } from "@/i18n/routing";

type Props = { params: Promise<{ locale: string }> };

/** Static marketing/legal page (ADR-033): prerendered per locale, served from the CDN. */
export const dynamic = "force-static";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal.privacy" });
  return { title: t("metaTitle") };
}

export default async function PrivacyPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("legal");
  const sections = t.raw("privacy.sections") as Array<{ title: string; body: string }>;
  return (
    <Container className="py-10">
      <PageHeader title={t("privacy.title")} />
      <Alert tone="warning" className="mb-6 max-w-3xl">
        {t("placeholderNotice")}
      </Alert>
      <div className="max-w-3xl space-y-6">
        {sections.map((s) => (
          <section key={s.title}>
            <h2 className="text-xl font-semibold text-sand-900">{s.title}</h2>
            <p className="mt-2 text-sand-800">{s.body}</p>
          </section>
        ))}
        <p className="text-sm text-sand-600">{t("lastUpdated", { date: "2026-10-15" })}</p>
      </div>
    </Container>
  );
}
