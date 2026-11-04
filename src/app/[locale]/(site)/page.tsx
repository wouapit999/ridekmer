import { CarFront, Handshake, ShieldCheck, Smartphone, Wallet } from "lucide-react";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";

import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { CarStrip, type StripCar } from "@/features/home/car-strip";
import { CountUp } from "@/features/home/count-up";
import { FestiveEyebrow, FestiveSparkles } from "@/features/home/festive-decor";
import { HeroSlideshow, type HeroPhoto } from "@/features/home/hero-slideshow";
import { Reveal } from "@/features/home/reveal";
import { SearchForm } from "@/features/vehicles/search-form";
import { buildWhere, listActiveCities } from "@/features/vehicles/search";
import credits from "@/features/vehicles/showcase-credits.json";
import { samplePhotoUrl } from "@/features/vehicles/showcase-data";
import { routing } from "@/i18n/routing";
import { formatXaf } from "@/lib/money";
import { db } from "@/server/db";
import { trySignedDownloadUrl } from "@/server/files/service";

/** Prerendered per locale and refreshed hourly (cities, cars, counts); see ADR-033. */
export const revalidate = 3600;

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

/** Freely licensed model photos behind the hero, credited on screen. */
const HERO_PHOTOS = [
  "toyota-land-cruiser-prado",
  "mercedes-benz-e-class",
  "toyota-rav4",
  "hyundai-tucson",
  "toyota-hilux",
];

async function featuredCars(locale: "fr" | "en"): Promise<StripCar[]> {
  const vehicles = await db.vehicle.findMany({
    where: buildWhere({ page: 1 }),
    orderBy: [{ instantBooking: "desc" }, { publishedAt: "desc" }],
    take: 10,
    select: {
      id: true,
      make: true,
      model: true,
      manufacturingYear: true,
      registrationNumber: true,
      dailyPriceXaf: true,
      city: { select: { nameFr: true, nameEn: true } },
      images: {
        where: { isPublic: true },
        orderBy: { sortOrder: "asc" },
        take: 1,
        select: { storageKey: true },
      },
    },
  });
  const cars = await Promise.all(
    vehicles.map(async (v): Promise<StripCar | null> => {
      // Signed links outlive the hourly refresh of this page.
      const stored = v.images[0]
        ? await trySignedDownloadUrl({ storageKey: v.images[0].storageKey, ttlSeconds: 7200 })
        : null;
      const photo = stored ?? samplePhotoUrl(v.registrationNumber);
      if (!photo) return null;
      return {
        id: v.id,
        name: `${v.make} ${v.model} ${v.manufacturingYear}`,
        city: locale === "en" ? v.city.nameEn : v.city.nameFr,
        price: formatXaf(v.dailyPriceXaf, locale),
        photo,
        illustrative: false,
      };
    }),
  );
  return cars.filter((c): c is StripCar => c !== null);
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("home");
  const currentLocale = (await getLocale()) === "en" ? "en" : "fr";
  const [cities, cars, carCount] = await Promise.all([
    listActiveCities().catch(() => []),
    featuredCars(currentLocale).catch(() => []),
    db.vehicle.count({ where: buildWhere({ page: 1 }) }).catch(() => 0),
  ]);

  const heroPhotos: HeroPhoto[] = HERO_PHOTOS.map((slug) => credits.find((c) => c.slug === slug))
    .filter((c): c is (typeof credits)[number] => Boolean(c))
    .map((c) => ({
      src: `/showcase/${c.file}`,
      alt: c.model,
      credit: { author: c.author, license: c.license, source: c.source },
    }));

  const pillars = [
    { key: "verified", icon: ShieldCheck },
    { key: "prices", icon: Wallet },
    { key: "payments", icon: Smartphone },
    { key: "support", icon: Handshake },
  ] as const;

  return (
    <>
      <section className="relative isolate overflow-hidden text-white" aria-labelledby="hero-title">
        <HeroSlideshow photos={heroPhotos} creditLabel={t("hero.photoCredit")}>
          {/* Scrim: keeps the text readable over any photo. */}
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 bg-gradient-to-r from-sand-900/90 via-sand-900/70 to-sand-900/25"
          />
          <div
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-t from-sand-900/80 to-transparent"
          />
          <FestiveSparkles />
          <Container className="relative grid gap-10 py-16 sm:py-20 lg:min-h-[86vh] lg:grid-cols-12 lg:items-center lg:py-24">
            <div className="lg:col-span-7">
              <p
                className="hero-rise text-sm font-semibold tracking-[0.18em] text-accent-200 uppercase"
                style={{ animationDelay: "0.05s" }}
              >
                <FestiveEyebrow fallback={t("hero.eyebrow")} />
              </p>
              <h1
                id="hero-title"
                className="hero-rise mt-4 text-4xl leading-[1.05] font-extrabold tracking-tight sm:text-6xl lg:text-7xl"
                style={{ animationDelay: "0.15s" }}
              >
                {t("hero.title")}
              </h1>
              <p
                className="hero-rise mt-6 max-w-xl text-lg text-white/85 sm:text-xl"
                style={{ animationDelay: "0.3s" }}
              >
                {t("hero.subtitle")}
              </p>
              <div
                className="hero-rise mt-8 flex flex-wrap gap-3"
                style={{ animationDelay: "0.45s" }}
              >
                <ButtonLink href="/cars" size="lg" className="shadow-lg shadow-brand-900/40">
                  {t("hero.cta")}
                </ButtonLink>
                <ButtonLink
                  href="/partner"
                  variant="outline"
                  size="lg"
                  className="border-white/40 bg-white/10 text-white backdrop-blur hover:bg-white/20"
                >
                  {t("hero.ctaSecondary")}
                </ButtonLink>
              </div>
              <dl
                className="hero-rise mt-10 grid max-w-xl grid-cols-3 gap-4 border-t border-white/15 pt-6"
                style={{ animationDelay: "0.6s" }}
              >
                <div>
                  <dt className="text-xs tracking-wide text-white/60 uppercase">
                    {t("stats.cars")}
                  </dt>
                  <dd className="mt-1 text-3xl font-bold">
                    <CountUp value={carCount} />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs tracking-wide text-white/60 uppercase">
                    {t("stats.cities")}
                  </dt>
                  <dd className="mt-1 text-3xl font-bold">
                    <CountUp value={cities.length} />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs tracking-wide text-white/60 uppercase">
                    {t("stats.payments")}
                  </dt>
                  <dd className="mt-2 text-sm font-semibold text-accent-200">
                    {t("stats.paymentsValue")}
                  </dd>
                </div>
              </dl>
            </div>
            <div className="hero-rise lg:col-span-5" style={{ animationDelay: "0.35s" }}>
              <div className="rounded-2xl bg-white/10 p-1.5 shadow-2xl ring-1 ring-white/20 backdrop-blur-md">
                <div className="text-sand-900">
                  <SearchForm
                    cities={cities.map((c) => ({
                      slug: c.slug,
                      name: currentLocale === "en" ? c.nameEn : c.nameFr,
                    }))}
                  />
                </div>
              </div>
            </div>
          </Container>
        </HeroSlideshow>
      </section>

      {cars.length > 0 ? (
        <section aria-labelledby="featured" className="bg-sand-50">
          <Container className="pt-14 pb-4">
            <Reveal className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 id="featured" className="text-3xl font-bold tracking-tight text-sand-900">
                  {t("featured.title")}
                </h2>
                <p className="mt-2 text-sand-700">{t("featured.subtitle")}</p>
              </div>
              <ButtonLink href="/cars" variant="ghost">
                {t("featured.all")} →
              </ButtonLink>
            </Reveal>
          </Container>
          <div className="pb-14">
            <CarStrip cars={cars} />
          </div>
        </section>
      ) : null}

      <section aria-labelledby="pillars" className="bg-white">
        <Container className="py-16">
          <Reveal>
            <h2 id="pillars" className="text-3xl font-bold tracking-tight text-sand-900">
              {t("pillars.title")}
            </h2>
          </Reveal>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {pillars.map(({ key, icon: Icon }, i) => (
              <Reveal key={key} delay={i * 90}>
                <div className="group h-full rounded-2xl border border-sand-200 bg-sand-50 p-6 transition duration-300 hover:-translate-y-1 hover:border-brand-200 hover:bg-white hover:shadow-card">
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-white shadow-md transition duration-300 group-hover:scale-110 group-hover:rotate-3">
                    <Icon className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <h3 className="mt-4 text-lg font-semibold text-sand-900">
                    {t(`pillars.${key}.title`)}
                  </h3>
                  <p className="mt-2 text-sm text-sand-700">{t(`pillars.${key}.body`)}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      <section aria-labelledby="models" className="bg-sand-50">
        <Container className="py-16">
          <Reveal>
            <h2 id="models" className="text-3xl font-bold tracking-tight text-sand-900">
              {t("models.title")}
            </h2>
          </Reveal>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {(["owned", "managed", "marketplace"] as const).map((key, i) => (
              <Reveal key={key} delay={i * 110}>
                <div className="h-full rounded-2xl border border-sand-200 bg-white p-6 transition duration-300 hover:-translate-y-1 hover:shadow-card">
                  <CarFront className="h-7 w-7 text-accent-600" aria-hidden="true" />
                  <h3 className="mt-4 text-lg font-semibold text-sand-900">
                    {t(`models.${key}.title`)}
                  </h3>
                  <p className="mt-2 text-sm text-sand-700">{t(`models.${key}.body`)}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      <section aria-labelledby="owner-cta" className="bg-white">
        <Container className="py-16">
          <Reveal>
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-800 via-brand-700 to-brand-600 px-6 py-12 text-white sm:px-12">
              <div
                aria-hidden="true"
                className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-accent-300/25 blur-3xl"
              />
              <div
                aria-hidden="true"
                className="absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-brand-300/20 blur-3xl"
              />
              <h2 id="owner-cta" className="relative text-3xl font-bold tracking-tight">
                {t("ownerCta.title")}
              </h2>
              <p className="relative mt-3 max-w-2xl text-brand-50">{t("ownerCta.body")}</p>
              <div className="relative mt-8">
                <ButtonLink href="/partner" variant="secondary" size="lg">
                  {t("ownerCta.cta")}
                </ButtonLink>
              </div>
            </div>
          </Reveal>
        </Container>
      </section>
    </>
  );
}
