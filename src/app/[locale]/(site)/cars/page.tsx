import type { Metadata } from "next";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";

import { Alert, Badge } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Container, PageHeader } from "@/components/ui/container";
import { Field, Input, Select } from "@/components/ui/field";
import { listActiveCities, parseSearchParams, searchVehicles } from "@/features/vehicles/search";
import { SearchForm } from "@/features/vehicles/search-form";
import { Link } from "@/i18n/navigation";
import { formatXaf } from "@/lib/money";
import { getCurrentSession } from "@/server/auth/session";
import { signedDownloadUrl } from "@/server/files/service";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "cars" });
  return { title: t("metaTitle") };
}

export default async function CarsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("cars");
  const tc = await getTranslations("common");
  const currentLocale = await getLocale();
  const raw = await searchParams;
  const filters = parseSearchParams(raw);
  const session = await getCurrentSession();
  const [cities, result] = await Promise.all([
    listActiveCities(),
    searchVehicles(filters, session?.user.id ?? null),
  ]);
  const photoUrls = new Map<string, string>();
  await Promise.all(
    result.vehicles.map(async (v) => {
      if (v.images[0])
        photoUrls.set(
          v.id,
          await signedDownloadUrl({ storageKey: v.images[0].storageKey, ttlSeconds: 3600 }),
        );
    }),
  );

  const defaults = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  );
  const datesQuery = new URLSearchParams(
    Object.entries(defaults).filter(
      ([k, v]) =>
        v && ["pickupDate", "pickupTime", "returnDate", "returnTime", "drive"].includes(k),
    ) as [string, string][],
  ).toString();

  return (
    <Container className="py-10">
      <PageHeader title={t("title")} intro={t("resultsCount", { count: result.total })} />
      <Alert tone="info" className="mb-6">
        {t("catalogueNote")}
      </Alert>
      <div className="grid gap-8 lg:grid-cols-4">
        <aside className="space-y-6 lg:col-span-1" aria-label={t("filters")}>
          <SearchForm
            cities={cities.map((c) => ({
              slug: c.slug,
              name: currentLocale === "en" ? c.nameEn : c.nameFr,
            }))}
            defaults={defaults}
          />
          <form
            action="/cars"
            method="get"
            className="rounded-xl border border-sand-200 bg-white p-5 shadow-card"
          >
            <h2 className="text-lg font-semibold">{t("filters")}</h2>
            {Object.entries(defaults)
              .filter(([k]) =>
                ["city", "pickupDate", "pickupTime", "returnDate", "returnTime", "drive"].includes(
                  k,
                ),
              )
              .map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
            <div className="mt-4 grid gap-4">
              <Field id="category" label={t("category")}>
                <Select id="category" name="category" defaultValue={defaults.category ?? ""}>
                  <option value="">{t("anyCategory")}</option>
                  {(
                    [
                      "ECONOMY",
                      "COMPACT",
                      "SEDAN",
                      "SUV",
                      "PICKUP",
                      "VAN",
                      "MINIBUS",
                      "LUXURY",
                      "UTILITY",
                    ] as const
                  ).map((c) => (
                    <option key={c} value={c}>
                      {t(`categories.${c}`)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field id="transmission" label={t("transmission")}>
                <Select
                  id="transmission"
                  name="transmission"
                  defaultValue={defaults.transmission ?? ""}
                >
                  <option value="">{t("anyTransmission")}</option>
                  <option value="MANUAL">{t("manual")}</option>
                  <option value="AUTOMATIC">{t("automatic")}</option>
                </Select>
              </Field>
              <Field id="fuel" label={t("fuel")}>
                <Select id="fuel" name="fuel" defaultValue={defaults.fuel ?? ""}>
                  <option value="">{t("anyFuel")}</option>
                  {(["PETROL", "DIESEL", "HYBRID", "ELECTRIC", "LPG"] as const).map((f) => (
                    <option key={f} value={f}>
                      {t(`fuels.${f}`)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field id="minSeats" label={t("minSeats")}>
                <Input
                  id="minSeats"
                  name="minSeats"
                  type="number"
                  min={1}
                  max={60}
                  inputMode="numeric"
                  defaultValue={defaults.minSeats}
                />
              </Field>
              <Field id="maxPrice" label={t("maxDailyPrice")}>
                <Input
                  id="maxPrice"
                  name="maxPrice"
                  type="number"
                  min={0}
                  step={1000}
                  inputMode="numeric"
                  defaultValue={defaults.maxPrice}
                />
              </Field>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="delivery"
                  value="1"
                  defaultChecked={defaults.delivery === "1"}
                  className="h-4 w-4"
                />{" "}
                {t("deliveryOnly")}
              </label>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="instant"
                  value="1"
                  defaultChecked={defaults.instant === "1"}
                  className="h-4 w-4"
                />{" "}
                {t("instantOnly")}
              </label>
              <div className="flex gap-2">
                <Button type="submit" variant="outline" className="flex-1">
                  {t("apply")}
                </Button>
                <Link
                  href="/cars"
                  className="inline-flex min-h-11 items-center px-3 text-sm font-medium text-sand-700 hover:text-brand-700"
                >
                  {t("reset")}
                </Link>
              </div>
            </div>
          </form>
        </aside>
        <section className="lg:col-span-3" aria-live="polite">
          {result.vehicles.length === 0 ? (
            <div className="rounded-xl border border-dashed border-sand-300 bg-white p-10 text-center text-sand-700">
              {t("empty")}
            </div>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {result.vehicles.map((v) => (
                <li
                  key={v.id}
                  className="flex flex-col overflow-hidden rounded-xl border border-sand-200 bg-white shadow-card"
                >
                  <Link
                    href={`/cars/${v.id}${datesQuery ? `?${datesQuery}` : ""}`}
                    className="block aspect-[4/3] bg-sand-100"
                  >
                    {photoUrls.get(v.id) ? (
                      // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived storage URL
                      <img
                        src={photoUrls.get(v.id)}
                        alt={`${v.make} ${v.model}`}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <span className="flex h-full items-center justify-center text-sm text-sand-500">
                        RideKmer
                      </span>
                    )}
                  </Link>
                  <div className="flex flex-1 flex-col p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="brand">{t(`categories.${v.category}`)}</Badge>
                      {v.instantBooking ? <Badge tone="good">{t("instantOnly")}</Badge> : null}
                      {v.chauffeurAvailable ? <Badge>{tc("nav.chauffeur")}</Badge> : null}
                    </div>
                    <h3 className="mt-2 text-lg font-semibold text-sand-900">
                      {v.make} {v.model}{" "}
                      <span className="font-normal text-sand-600">{v.manufacturingYear}</span>
                    </h3>
                    <p className="text-sm text-sand-600">
                      {currentLocale === "en" ? v.city.nameEn : v.city.nameFr} ·{" "}
                      {v.transmission === "AUTOMATIC" ? t("automatic") : t("manual")} ·{" "}
                      {t(`fuels.${v.fuelType}`)} · {tc("seats", { count: v.seats })}
                    </p>
                    <p className="mt-3 text-xl font-bold text-brand-700">
                      {formatXaf(v.dailyPriceXaf, currentLocale)}{" "}
                      <span className="text-sm font-normal text-sand-600">{tc("perDay")}</span>
                    </p>
                    <p className="text-xs text-sand-600">
                      {t("deposit", { amount: formatXaf(v.securityDepositXaf, currentLocale) })}
                    </p>
                    <Link
                      href={`/cars/${v.id}${datesQuery ? `?${datesQuery}` : ""}`}
                      className="mt-3 inline-block font-medium text-brand-700 hover:underline"
                    >
                      {t("viewDetails")} →
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Container>
  );
}
