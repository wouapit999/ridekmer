import { CarFront, Handshake, ShieldCheck, Smartphone, Wallet } from "lucide-react";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";

import { ButtonLink } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { SearchForm } from "@/features/vehicles/search-form";
import { listActiveCities } from "@/features/vehicles/search";

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("home");
  const currentLocale = await getLocale();
  const cities = await listActiveCities().catch(() => []);

  const pillars = [
    { key: "verified", icon: ShieldCheck },
    { key: "prices", icon: Wallet },
    { key: "payments", icon: Smartphone },
    { key: "support", icon: Handshake },
  ] as const;

  return (
    <>
      <section className="bg-gradient-to-b from-brand-50 to-sand-50">
        <Container className="grid gap-10 py-12 lg:grid-cols-5 lg:items-center lg:py-20">
          <div className="lg:col-span-3">
            <p className="text-sm font-semibold tracking-wide text-brand-700 uppercase">
              {t("hero.eyebrow")}
            </p>
            <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-sand-900 sm:text-5xl">
              {t("hero.title")}
            </h1>
            <p className="mt-4 max-w-xl text-lg text-sand-700">{t("hero.subtitle")}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <ButtonLink href="/cars" size="lg">
                {t("hero.cta")}
              </ButtonLink>
              <ButtonLink href="/partner" variant="outline" size="lg">
                {t("hero.ctaSecondary")}
              </ButtonLink>
            </div>
          </div>
          <div className="lg:col-span-2">
            <SearchForm
              cities={cities.map((c) => ({
                slug: c.slug,
                name: currentLocale === "en" ? c.nameEn : c.nameFr,
              }))}
            />
          </div>
        </Container>
      </section>

      <section aria-labelledby="pillars">
        <Container className="py-12">
          <h2 id="pillars" className="text-2xl font-bold text-sand-900">
            {t("pillars.title")}
          </h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {pillars.map(({ key, icon: Icon }) => (
              <Card key={key}>
                <Icon className="h-7 w-7 text-brand-600" aria-hidden="true" />
                <CardTitle className="mt-3">{t(`pillars.${key}.title`)}</CardTitle>
                <p className="mt-2 text-sm text-sand-700">{t(`pillars.${key}.body`)}</p>
              </Card>
            ))}
          </div>
        </Container>
      </section>

      <section aria-labelledby="models" className="bg-white">
        <Container className="py-12">
          <h2 id="models" className="text-2xl font-bold text-sand-900">
            {t("models.title")}
          </h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {(["owned", "managed", "marketplace"] as const).map((key) => (
              <div key={key} className="rounded-lg border border-sand-200 bg-sand-50 p-5">
                <CarFront className="h-6 w-6 text-accent-600" aria-hidden="true" />
                <h3 className="mt-3 font-semibold text-sand-900">{t(`models.${key}.title`)}</h3>
                <p className="mt-2 text-sm text-sand-700">{t(`models.${key}.body`)}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <section aria-labelledby="owner-cta">
        <Container className="py-12">
          <div className="rounded-xl bg-brand-700 px-6 py-10 text-white sm:px-10">
            <h2 id="owner-cta" className="text-2xl font-bold">
              {t("ownerCta.title")}
            </h2>
            <p className="mt-2 max-w-2xl text-brand-50">{t("ownerCta.body")}</p>
            <div className="mt-6">
              <ButtonLink href="/partner" variant="secondary" size="lg">
                {t("ownerCta.cta")}
              </ButtonLink>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
