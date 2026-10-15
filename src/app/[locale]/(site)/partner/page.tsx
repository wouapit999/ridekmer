import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { ButtonLink } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Container, PageHeader } from "@/components/ui/container";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "partner" });
  return { title: t("metaTitle") };
}

export default async function PartnerPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("partner");
  const items = t.raw("requirements.items") as string[];
  return (
    <Container className="py-10">
      <PageHeader title={t("title")} intro={t("intro")} />
      <div className="grid gap-4 md:grid-cols-2">
        {(["managed", "marketplace"] as const).map((key) => (
          <Card key={key}>
            <CardTitle>{t(`options.${key}.title`)}</CardTitle>
            <p className="mt-2 text-sand-700">{t(`options.${key}.body`)}</p>
          </Card>
        ))}
      </div>
      <section className="mt-10 grid gap-8 md:grid-cols-2">
        <div>
          <h2 className="text-xl font-semibold text-sand-900">{t("requirements.title")}</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sand-700">
            {items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="text-xl font-semibold text-sand-900">{t("earnings.title")}</h2>
          <p className="mt-3 text-sand-700">{t("earnings.body")}</p>
        </div>
      </section>
      <div className="mt-10 flex flex-wrap gap-3">
        <ButtonLink href="/register?intent=owner" size="lg">
          {t("cta")}
        </ButtonLink>
        <ButtonLink href="/login" variant="outline" size="lg">
          {t("ctaExisting")}
        </ButtonLink>
      </div>
    </Container>
  );
}
