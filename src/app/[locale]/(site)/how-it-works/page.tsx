import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Card, CardTitle } from "@/components/ui/card";
import { Container, PageHeader } from "@/components/ui/container";
import { Link } from "@/i18n/navigation";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "howItWorks" });
  return { title: t("metaTitle") };
}

export default async function HowItWorksPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("howItWorks");
  return (
    <Container className="py-10">
      <PageHeader title={t("title")} intro={t("intro")} />
      <ol className="grid gap-4 md:grid-cols-2">
        {(["search", "verify", "pay", "drive"] as const).map((key) => (
          <li key={key}>
            <Card className="h-full">
              <CardTitle>{t(`steps.${key}.title`)}</CardTitle>
              <p className="mt-2 text-sand-700">{t(`steps.${key}.body`)}</p>
            </Card>
          </li>
        ))}
      </ol>
      <p className="mt-8">
        <Link href="/faq" className="font-medium text-brand-700 underline-offset-4 hover:underline">
          {t("faqLink")}
        </Link>
      </p>
    </Container>
  );
}
