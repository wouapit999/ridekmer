import type { Metadata } from "next";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { Alert, Badge } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Field, Input } from "@/components/ui/field";
import {
  AvailabilityError,
  unavailableRanges,
  windowFromLocal,
} from "@/features/availability/service";
import { QuoteBreakdown } from "@/features/bookings/quote-breakdown";
import { BookingError, getBookableVehicle, quoteBooking } from "@/features/bookings/service";
import { FileLink } from "@/features/documents/file-link";
import { getPricingSettings } from "@/features/pricing/settings";
import { getCurrentSession } from "@/server/auth/session";
import { signedDownloadUrl } from "@/server/files/service";
import { formatXaf } from "@/lib/money";

type Props = {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const vehicle = await getBookableVehicle(id);
  return {
    title: vehicle ? `${vehicle.make} ${vehicle.model} ${vehicle.manufacturingYear}` : "RideKmer",
  };
}

export default async function VehicleDetailPage({ params, searchParams }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const vehicle = await getBookableVehicle(id);
  if (!vehicle) notFound();
  const sp = await searchParams;
  const t = await getTranslations("cars");
  const tc = await getTranslations("common");
  const ts = await getTranslations("home.search");
  const currentLocale = (await getLocale()) === "en" ? "en" : "fr";
  const session = await getCurrentSession();
  const settings = await getPricingSettings();
  const [ranges, photoUrls] = await Promise.all([
    unavailableRanges(vehicle.id),
    Promise.all(
      vehicle.images
        .slice(0, 6)
        .map((img) => signedDownloadUrl({ storageKey: img.storageKey, ttlSeconds: 3600 })),
    ),
  ]);

  const pickupDate = sp.pickupDate ?? "";
  const pickupTime = sp.pickupTime ?? "09:00";
  const returnDate = sp.returnDate ?? "";
  const returnTime = sp.returnTime ?? "09:00";
  const drive = sp.drive === "chauffeur" ? "chauffeur" : "self";
  let quoteError: string | null = null;
  let quote: Awaited<ReturnType<typeof quoteBooking>> | null = null;
  if (pickupDate && returnDate) {
    try {
      const window = windowFromLocal(pickupDate, pickupTime, returnDate, returnTime);
      quote = await quoteBooking(
        vehicle.id,
        window,
        {
          chauffeur: drive === "chauffeur",
          delivery: false,
          returnPickup: false,
          additionalDrivers: 0,
        },
        session?.user.id ?? null,
      );
    } catch (error) {
      if (error instanceof BookingError || error instanceof AvailabilityError)
        quoteError = error.code;
      else throw error;
    }
  }
  const bookQuery = new URLSearchParams({
    pickupDate,
    pickupTime,
    returnDate,
    returnTime,
    drive,
  }).toString();
  const name = (o: { nameFr: string; nameEn: string }) =>
    currentLocale === "en" ? o.nameEn : o.nameFr;
  const description =
    currentLocale === "en"
      ? (vehicle.descriptionEn ?? vehicle.descriptionFr)
      : (vehicle.descriptionFr ?? vehicle.descriptionEn);

  return (
    <Container className="py-10">
      <div className="grid gap-8 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <header>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="brand">{t(`categories.${vehicle.category}`)}</Badge>
              {vehicle.instantBooking ? (
                <Badge tone="good">{t("detail.instant")}</Badge>
              ) : (
                <Badge>{t("detail.ownerApproval")}</Badge>
              )}
              {vehicle.chauffeurAvailable ? <Badge>{tc("nav.chauffeur")}</Badge> : null}
            </div>
            <h1 className="mt-2 text-3xl font-bold text-sand-900">
              {vehicle.make} {vehicle.model}{" "}
              <span className="font-normal text-sand-600">{vehicle.manufacturingYear}</span>
            </h1>
            <p className="text-sand-600">
              {name(vehicle.city)}
              {vehicle.branch
                ? ` · ${name(vehicle.branch)}`
                : vehicle.locationLabel
                  ? ` · ${vehicle.locationLabel}`
                  : ""}
            </p>
          </header>
          {photoUrls.length ? (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {photoUrls.map((url, i) => (
                <li key={url} className="overflow-hidden rounded-lg bg-sand-100">
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed, short-lived storage URL */}
                  <img
                    src={url}
                    alt={`${vehicle.make} ${vehicle.model} ${i + 1}`}
                    className="aspect-[4/3] h-full w-full object-cover"
                    loading={i === 0 ? "eager" : "lazy"}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex aspect-[16/9] items-center justify-center rounded-lg bg-sand-100 text-sand-500">
              {t("detail.photos", { count: 0 })}
            </div>
          )}
          {description ? <p className="text-sand-800">{description}</p> : null}
          <section>
            <h2 className="text-lg font-semibold">{t("detail.specs")}</h2>
            <dl className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
              {[
                [
                  t("transmission"),
                  vehicle.transmission === "AUTOMATIC" ? t("automatic") : t("manual"),
                ],
                [t("fuel"), t(`fuels.${vehicle.fuelType}`)],
                [t("minSeats"), tc("seats", { count: vehicle.seats })],
                [t("detail.doors", { count: vehicle.doors ?? 4 }), vehicle.bodyType],
                [
                  t("detail.mileage", {
                    km: vehicle.currentMileageKm.toLocaleString(
                      currentLocale === "en" ? "en-CM" : "fr-CM",
                    ),
                  }),
                  vehicle.colour ?? "—",
                ],
              ].map(([k, v]) => (
                <div key={k} className="rounded-md bg-sand-50 p-2">
                  <dt className="text-xs text-sand-600">{k}</dt>
                  <dd className="font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            <ul className="mt-3 flex flex-wrap gap-2 text-xs">
              {vehicle.hasAirConditioning ? <Badge>A/C</Badge> : null}
              {vehicle.hasBluetooth ? <Badge>Bluetooth</Badge> : null}
              {vehicle.hasUsbCharging ? <Badge>USB</Badge> : null}
              {vehicle.hasReversingCamera ? <Badge>Camera</Badge> : null}
              {vehicle.safetyEquipment.map((s) => (
                <Badge key={s}>{s.replace(/_/g, " ")}</Badge>
              ))}
            </ul>
          </section>
          {vehicle.existingDamageNotes ? (
            <Alert tone="info" title={t("detail.existingDamage")}>
              {vehicle.existingDamageNotes}
            </Alert>
          ) : null}
          <section>
            <h2 className="text-lg font-semibold">{t("detail.unavailable")}</h2>
            {ranges.length === 0 ? (
              <p className="text-sm text-sand-600">{t("detail.noUnavailable")}</p>
            ) : null}
            <ul className="mt-2 flex flex-wrap gap-2 text-sm">
              {ranges.map((r) => (
                <li
                  key={`${r.from}-${r.to}`}
                  className="rounded-md bg-danger-50 px-2 py-1 text-danger-700"
                >
                  {r.from} → {r.to}
                </li>
              ))}
            </ul>
          </section>
        </div>
        <aside className="space-y-4">
          <div className="rounded-xl border border-sand-200 bg-white p-5 shadow-card">
            <p className="text-2xl font-bold text-brand-700">
              {formatXaf(vehicle.dailyPriceXaf, currentLocale)}{" "}
              <span className="text-sm font-normal text-sand-600">{tc("perDay")}</span>
            </p>
            <dl className="mt-2 space-y-1 text-sm text-sand-700">
              {vehicle.weeklyPriceXaf ? (
                <div className="flex justify-between">
                  <dt>{t("detail.weekly")}</dt>
                  <dd>{formatXaf(vehicle.weeklyPriceXaf, currentLocale)}</dd>
                </div>
              ) : null}
              {vehicle.monthlyPriceXaf ? (
                <div className="flex justify-between">
                  <dt>{t("detail.monthly")}</dt>
                  <dd>{formatXaf(vehicle.monthlyPriceXaf, currentLocale)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between">
                <dt>{t("detail.deposit")}</dt>
                <dd>{formatXaf(vehicle.securityDepositXaf, currentLocale)}</dd>
              </div>
              {vehicle.dailyKmAllowance ? (
                <div>
                  <dt className="sr-only">km</dt>
                  <dd>
                    {t("detail.kmAllowance", { km: vehicle.dailyKmAllowance })}
                    {vehicle.extraKmRateXaf
                      ? ` · ${t("detail.extraKm", { amount: formatXaf(vehicle.extraKmRateXaf, currentLocale) })}`
                      : ""}
                  </dd>
                </div>
              ) : null}
              {vehicle.chauffeurAvailable && vehicle.chauffeurDailyFeeXaf ? (
                <div>
                  <dd>
                    {t("detail.chauffeurFee", {
                      amount: formatXaf(vehicle.chauffeurDailyFeeXaf, currentLocale),
                    })}
                  </dd>
                </div>
              ) : null}
              {vehicle.deliveryAvailable ? (
                <div>
                  <dd>{t("detail.deliveryAvailable", { km: vehicle.deliveryRadiusKm ?? 0 })}</dd>
                </div>
              ) : null}
            </dl>
            <form method="get" className="mt-4 space-y-3" aria-labelledby="quote-title">
              <h2 id="quote-title" className="font-semibold">
                {t("detail.quoteTitle")}
              </h2>
              <div className="grid grid-cols-2 gap-2">
                <Field id="pickupDate" label={ts("pickupDate")}>
                  <Input
                    id="pickupDate"
                    name="pickupDate"
                    type="date"
                    defaultValue={pickupDate}
                    required
                  />
                </Field>
                <Field id="pickupTime" label={ts("pickupTime")}>
                  <Input id="pickupTime" name="pickupTime" type="time" defaultValue={pickupTime} />
                </Field>
                <Field id="returnDate" label={ts("returnDate")}>
                  <Input
                    id="returnDate"
                    name="returnDate"
                    type="date"
                    defaultValue={returnDate}
                    required
                  />
                </Field>
                <Field id="returnTime" label={ts("returnTime")}>
                  <Input id="returnTime" name="returnTime" type="time" defaultValue={returnTime} />
                </Field>
              </div>
              <div className="flex gap-4 text-sm">
                {vehicle.selfDriveAllowed ? (
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      name="drive"
                      value="self"
                      defaultChecked={drive === "self"}
                      className="h-4 w-4"
                    />{" "}
                    {ts("selfDrive")}
                  </label>
                ) : null}
                {vehicle.chauffeurAvailable ? (
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      name="drive"
                      value="chauffeur"
                      defaultChecked={drive === "chauffeur" || !vehicle.selfDriveAllowed}
                      className="h-4 w-4"
                    />{" "}
                    {ts("chauffeur")}
                  </label>
                ) : null}
              </div>
              <Button type="submit" variant="outline" className="w-full">
                {t("detail.quoteSubmit")}
              </Button>
            </form>
          </div>
          {quoteError ? (
            <Alert tone="danger">
              {t.has(`availabilityErrors.${quoteError}` as "availabilityErrors.UNAVAILABLE")
                ? t(`availabilityErrors.${quoteError}` as "availabilityErrors.UNAVAILABLE", {
                    hours: settings.minAdvanceHours,
                  })
                : quoteError}
            </Alert>
          ) : null}
          {quote ? (
            <>
              <QuoteBreakdown quote={quote.quote} />
              {session ? (
                <ButtonLink href={`/book/${vehicle.id}?${bookQuery}`} size="lg" className="w-full">
                  {t("detail.book")}
                </ButtonLink>
              ) : (
                <ButtonLink
                  href={`/login?returnTo=${encodeURIComponent(`/book/${vehicle.id}?${bookQuery}`)}`}
                  size="lg"
                  className="w-full"
                >
                  {t("detail.loginToBook")}
                </ButtonLink>
              )}
            </>
          ) : null}
          {vehicle.images[0] ? (
            <p className="text-xs text-sand-500">
              <FileLink
                storageKey={vehicle.images[0].storageKey}
                label={t("detail.photos", { count: vehicle.images.length })}
              />
            </p>
          ) : null}
        </aside>
      </div>
    </Container>
  );
}
