import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Container, PageHeader } from "@/components/ui/container";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "faq" });
  return { title: t("metaTitle") };
}

export default async function FaqPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("faq");
  const items = t.raw("items") as Array<{ q: string; a: string }>;
  return (
    <Container className="py-10">
      <PageHeader title={t("title")} />
      <div className="max-w-3xl divide-y divide-sand-200 rounded-xl border border-sand-200 bg-white">
        {items.map((item) => (
          <details key={item.q} className="group p-5">
            <summary className="cursor-pointer list-none text-base font-semibold text-sand-900 marker:hidden">
              {item.q}
            </summary>
            <p className="mt-3 text-sand-700">{item.a}</p>
          </details>
        ))}
      </div>
    </Container>
  );
}
