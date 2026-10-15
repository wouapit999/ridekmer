import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Container, PageHeader } from "@/components/ui/container";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { AvailabilityError, windowFromLocal } from "@/features/availability/service";
import { ConfirmBookingForm } from "@/features/bookings/customer-forms";
import { QuoteBreakdown } from "@/features/bookings/quote-breakdown";
import {
  BookingError,
  ensureHold,
  getBookableVehicle,
  quoteBooking,
} from "@/features/bookings/service";
import { getPricingSettings } from "@/features/pricing/settings";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";

type Props = {
  params: Promise<{ locale: string; vehicleId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "checkout" });
  return { title: t("metaTitle") };
}

export default async function CheckoutPage({ params, searchParams }: Props) {
  const { locale, vehicleId } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const query = new URLSearchParams(
    Object.entries(sp).filter((e): e is [string, string] => Boolean(e[1])),
  ).toString();
  const { user } = await requireUser(`/book/${vehicleId}?${query}`);
  const vehicle = await getBookableVehicle(vehicleId);
  if (!vehicle) notFound();
  const t = await getTranslations("checkout");
  const ts = await getTranslations("home.search");
  const te = await getTranslations("cars.availabilityErrors");
  const currentLocale = (await getLocale()) === "en" ? "en" : "fr";
  const format = await getFormatter();
  const settings = await getPricingSettings();

  const pickupDate = sp.pickupDate ?? "";
  const pickupTime = sp.pickupTime ?? "09:00";
  const returnDate = sp.returnDate ?? "";
  const returnTime = sp.returnTime ?? "09:00";
  const chauffeur =
    sp.drive === "chauffeur" || (!vehicle.selfDriveAllowed && vehicle.chauffeurAvailable);
  const delivery = sp.delivery === "1";
  const returnPickup = sp.returnPickup === "1";
  const additionalDrivers = Math.min(3, Math.max(0, Number(sp.additionalDrivers ?? 0) || 0));
  const promoCode = sp.promoCode?.trim() || null;
  const options = {
    chauffeur,
    delivery,
    returnPickup,
    additionalDrivers,
    promoCode,
    pickupAddress: sp.pickupAddress ?? null,
    returnAddress: sp.returnAddress ?? null,
  };

  let error: string | null = null;
  let quote: Awaited<ReturnType<typeof quoteBooking>> | null = null;
  let holdUntil: Date | null = null;
  if (pickupDate && returnDate) {
    try {
      const window = windowFromLocal(pickupDate, pickupTime, returnDate, returnTime);
      quote = await quoteBooking(vehicle.id, window, options, user.id);
      const hold = await ensureHold({ vehicleId: vehicle.id, userId: user.id, window });
      holdUntil = hold.expiresAt;
    } catch (e) {
      if (e instanceof BookingError || e instanceof AvailabilityError) error = e.code;
      else throw e;
    }
  } else {
    error = "INVALID_RANGE";
  }
  const customer = await db.customerProfile.findUnique({
    where: { userId: user.id },
    select: { approvedAt: true },
  });
  const verified = Boolean(customer?.approvedAt);

  return (
    <Container className="py-10">
      <PageHeader title={t("title")} intro={t("intro", { minutes: settings.holdMinutes })} />
      <div className="grid gap-8 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <form method="get" className="space-y-4 rounded-xl border border-sand-200 bg-white p-5">
            <h2 className="text-lg font-semibold">{t("dates")}</h2>
            <div className="grid grid-cols-2 gap-3">
              <Field id="pickupDate" label={ts("pickupDate")} required>
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
              <Field id="returnDate" label={ts("returnDate")} required>
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
            <h2 className="text-lg font-semibold">{t("options")}</h2>
            <div className="flex flex-wrap gap-4 text-sm">
              {vehicle.selfDriveAllowed ? (
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="drive"
                    value="self"
                    defaultChecked={!chauffeur}
                    className="h-4 w-4"
                  />{" "}
                  {t("selfDrive")}
                </label>
              ) : null}
              {vehicle.chauffeurAvailable ? (
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="drive"
                    value="chauffeur"
                    defaultChecked={chauffeur}
                    className="h-4 w-4"
                  />{" "}
                  {t("chauffeur")}
                </label>
              ) : null}
            </div>
            {vehicle.deliveryAvailable ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox name="delivery" value="1" defaultChecked={delivery} /> {t("delivery")}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox name="returnPickup" value="1" defaultChecked={returnPickup} />{" "}
                  {t("returnPickup")}
                </label>
                <Field id="pickupAddress" label={t("pickupAddress")}>
                  <Input
                    id="pickupAddress"
                    name="pickupAddress"
                    defaultValue={sp.pickupAddress ?? ""}
                    maxLength={300}
                  />
                </Field>
                <Field id="returnAddress" label={t("returnAddress")}>
                  <Input
                    id="returnAddress"
                    name="returnAddress"
                    defaultValue={sp.returnAddress ?? ""}
                    maxLength={300}
                  />
                </Field>
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              {!chauffeur ? (
                <Field id="additionalDrivers" label={t("additionalDrivers")}>
                  <Input
                    id="additionalDrivers"
                    name="additionalDrivers"
                    type="number"
                    min={0}
                    max={3}
                    defaultValue={additionalDrivers}
                  />
                </Field>
              ) : null}
              <Field id="promoCode" label={t("promoCode")}>
                <Input
                  id="promoCode"
                  name="promoCode"
                  defaultValue={promoCode ?? ""}
                  maxLength={40}
                  className="uppercase"
                />
              </Field>
            </div>
            <Button type="submit" variant="outline">
              {t("apply")}
            </Button>
          </form>
          {error ? (
            <Alert tone="danger">
              {te.has(error as "UNAVAILABLE")
                ? te(error as "UNAVAILABLE", { hours: settings.minAdvanceHours })
                : error}
            </Alert>
          ) : null}
          {quote ? (
            <div className="space-y-4 rounded-xl border border-sand-200 bg-white p-5">
              {!chauffeur && !verified ? (
                <Alert tone="warning">{t("verificationNotice")}</Alert>
              ) : null}
              <Alert tone="info">{t("paymentNotice")}</Alert>
              <ConfirmBookingForm
                fields={{
                  vehicleId: vehicle.id,
                  pickupDate,
                  pickupTime,
                  returnDate,
                  returnTime,
                  chauffeur: chauffeur ? "1" : "0",
                  delivery: delivery ? "1" : "0",
                  returnPickup: returnPickup ? "1" : "0",
                  additionalDrivers: String(additionalDrivers),
                  promoCode: promoCode ?? "",
                  pickupAddress: sp.pickupAddress ?? "",
                  returnAddress: sp.returnAddress ?? "",
                }}
                minAdvanceHours={settings.minAdvanceHours}
                holdUntil={holdUntil ? format.dateTime(holdUntil, "full") : undefined}
              />
            </div>
          ) : null}
        </div>
        <aside className="space-y-4">
          <div className="rounded-xl border border-sand-200 bg-white p-5">
            <p className="font-semibold">
              {vehicle.make} {vehicle.model} {vehicle.manufacturingYear}
            </p>
            <p className="text-sm text-sand-600">
              {currentLocale === "en" ? vehicle.city.nameEn : vehicle.city.nameFr}
            </p>
            {quote ? (
              <p className="mt-2 text-sm text-sand-700">
                {t("pickup")}: {format.dateTime(quote.window.startAt, "full")}
                <br />
                {t("return")}: {format.dateTime(quote.window.endAt, "full")}
              </p>
            ) : null}
          </div>
          {quote ? <QuoteBreakdown quote={quote.quote} /> : null}
        </aside>
      </div>
    </Container>
  );
}
