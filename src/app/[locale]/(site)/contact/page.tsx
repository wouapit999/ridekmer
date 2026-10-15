import type { Metadata } from "next";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";

import { Container, PageHeader } from "@/components/ui/container";
import { ContactForm } from "@/features/contact/contact-form";
import { db } from "@/server/db";
import { routing } from "@/i18n/routing";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ category?: string }> };

/** Static marketing/legal page (ADR-033): prerendered per locale, served from the CDN. */
export const dynamic = "force-static";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "contact" });
  return { title: t("metaTitle") };
}

export default async function ContactPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("contact");
  const currentLocale = await getLocale();
  const { category } = await searchParams;
  const branches = await db.branch
    .findMany({
      where: { isActive: true },
      include: { city: true },
      orderBy: { city: { sortOrder: "asc" } },
    })
    .catch(() => []);
  return (
    <Container className="py-10">
      <PageHeader title={t("title")} intro={t("intro")} />
      <div className="grid gap-10 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ContactForm defaultCategory={category} />
        </div>
        <aside>
          <h2 className="text-lg font-semibold text-sand-900">{t("offices")}</h2>
          <ul className="mt-3 space-y-3 text-sm text-sand-700">
            {branches.map((b) => (
              <li key={b.id} className="rounded-lg border border-sand-200 bg-white p-4">
                <p className="font-medium text-sand-900">
                  {currentLocale === "en" ? b.nameEn : b.nameFr}
                </p>
                <p>{b.addressLine}</p>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-sand-600">{t("hours")}</p>
        </aside>
      </div>
    </Container>
  );
}
