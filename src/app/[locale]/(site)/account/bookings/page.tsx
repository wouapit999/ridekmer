import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations, setRequestLocale } from "next-intl/server";

import { Container, PageHeader } from "@/components/ui/container";
import { AccountNav } from "@/features/account/account-nav";
import { BookingStatusBadge } from "@/features/bookings/booking-badge";
import { listCustomerBookings } from "@/features/bookings/queries";
import { Link } from "@/i18n/navigation";
import { formatXaf } from "@/lib/money";
import { requireUser } from "@/server/auth/session";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "bookings" });
  return { title: t("metaTitle") };
}

export default async function CustomerBookingsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { user } = await requireUser("/account/bookings");
  const t = await getTranslations("bookings");
  const currentLocale = (await getLocale()) === "en" ? "en" : "fr";
  const format = await getFormatter();
  const bookings = await listCustomerBookings(user.id);
  return (
    <Container className="py-10">
      <PageHeader title={t("title")} />
      <AccountNav current="bookings" />
      <div className="mt-6">
        {bookings.length === 0 ? <p className="text-sand-600">{t("empty")}</p> : null}
        <ul className="grid gap-4 sm:grid-cols-2">
          {bookings.map((b) => (
            <li key={b.id} className="rounded-xl border border-sand-200 bg-white p-5 shadow-card">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-mono text-sm text-sand-600">{b.reference}</p>
                <BookingStatusBadge status={b.status} />
              </div>
              <p className="mt-1 text-lg font-semibold">
                {b.vehicle.make} {b.vehicle.model}
              </p>
              <p className="text-sm text-sand-600">
                {format.dateTime(b.startAt, "full")} → {format.dateTime(b.endAt, "full")} ·{" "}
                {currentLocale === "en" ? b.vehicle.city.nameEn : b.vehicle.city.nameFr}
              </p>
              <p className="mt-2 font-semibold text-brand-700">
                {b.priceSnapshots[0]
                  ? formatXaf(
                      b.priceSnapshots[0].totalRentalXaf + b.priceSnapshots[0].securityDepositXaf,
                      currentLocale,
                    )
                  : "—"}
              </p>
              <Link
                href={`/account/bookings/${b.id}`}
                className="mt-3 inline-block font-medium text-brand-700 hover:underline"
              >
                {t("view")} →
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </Container>
  );
}
