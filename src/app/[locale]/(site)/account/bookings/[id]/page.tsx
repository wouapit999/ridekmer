import { getFormatter, getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Container, PageHeader } from "@/components/ui/container";
import { AccountNav } from "@/features/account/account-nav";
import { localDateTimeParts } from "@/features/availability/service";
import { BookingStatusBadge } from "@/features/bookings/booking-badge";
import { CancelBookingForm, ExtensionForm } from "@/features/bookings/customer-forms";
import { QuoteBreakdown } from "@/features/bookings/quote-breakdown";
import { BookingError, getBookingForCustomer } from "@/features/bookings/service";
import { CUSTOMER_CANCELLABLE } from "@/features/bookings/state-machine";
import { getPricingSettings } from "@/features/pricing/settings";
import { formatXaf } from "@/lib/money";
import { requireUser } from "@/server/auth/session";

type Props = { params: Promise<{ locale: string; id: string }> };

export default async function CustomerBookingDetailPage({ params }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const { user } = await requireUser(`/account/bookings/${id}`);
  let booking: Awaited<ReturnType<typeof getBookingForCustomer>>;
  try {
    booking = await getBookingForCustomer(id, user.id);
  } catch (error) {
    if (error instanceof BookingError) notFound();
    throw error;
  }
  const t = await getTranslations("bookings");
  const currentLocale = (await getLocale()) === "en" ? "en" : "fr";
  const format = await getFormatter();
  const settings = await getPricingSettings();
  const snapshot = booking.priceSnapshots[0];
  const breakdown = (snapshot?.breakdown ?? { lines: [], grandTotalXaf: 0 }) as {
    lines: Array<{ key: string; amountXaf: number; detail?: string }>;
    grandTotalXaf: number;
  };

  return (
    <Container className="py-10">
      <PageHeader
        title={t("detail.title", { reference: booking.reference })}
        intro={`${booking.vehicle.make} ${booking.vehicle.model} · ${currentLocale === "en" ? booking.vehicle.city.nameEn : booking.vehicle.city.nameFr}`}
      />
      <AccountNav current="bookings" />
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="flex flex-wrap items-center gap-3">
            <BookingStatusBadge status={booking.status} />
            {booking.cancellationFeeXaf ? (
              <span className="text-sm text-danger-700">
                {t("detail.cancellationFee", {
                  amount: formatXaf(booking.cancellationFeeXaf, currentLocale),
                })}
              </span>
            ) : null}
          </div>
          {booking.status === "PAYMENT_PENDING" && booking.paymentDueAt ? (
            <Alert
              tone="warning"
              title={t("detail.paymentDue", {
                time: format.dateTime(booking.paymentDueAt, "full"),
              })}
            >
              {t("detail.paymentSoon")}
            </Alert>
          ) : null}
          {booking.status === "PENDING_VERIFICATION" ? (
            <Alert tone="warning">
              {t("detail.pendingVerification")}{" "}
              <ButtonLink href="/account/documents" variant="ghost" size="sm">
                →
              </ButtonLink>
            </Alert>
          ) : null}
          {booking.status === "EXTENSION_REQUESTED" ? (
            <Alert tone="info">{t("detail.extensionRequested")}</Alert>
          ) : null}
          <dl className="grid gap-3 rounded-xl border border-sand-200 bg-white p-5 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-sand-600">{t("detail.pickupAt")}</dt>
              <dd className="font-medium">
                {format.dateTime(booking.startAt, "full")}
                {booking.pickupMode === "DELIVERY"
                  ? ` · ${booking.pickupAddress ?? ""}`
                  : booking.pickupBranch
                    ? ` · ${currentLocale === "en" ? booking.pickupBranch.nameEn : booking.pickupBranch.nameFr}`
                    : ""}
              </dd>
            </div>
            <div>
              <dt className="text-sand-600">{t("detail.returnAt")}</dt>
              <dd className="font-medium">{format.dateTime(booking.endAt, "full")}</dd>
            </div>
            {booking.customerNotes ? (
              <div className="sm:col-span-2">
                <dt className="text-sand-600">{t("detail.notes")}</dt>
                <dd>{booking.customerNotes}</dd>
              </div>
            ) : null}
          </dl>
          <p className="text-xs text-sand-600">{t("detail.contract")}</p>
          <section>
            <h2 className="text-lg font-semibold">{t("detail.history")}</h2>
            <ol className="mt-2 space-y-1 text-sm">
              {booking.statusHistory.map((h) => (
                <li key={h.id} className="flex flex-wrap gap-2 text-sand-700">
                  <span className="font-mono text-xs text-sand-500">
                    {format.dateTime(h.createdAt, "full")}
                  </span>
                  <BookingStatusBadge status={h.toStatus} />
                  {h.reason ? <span>· {h.reason}</span> : null}
                </li>
              ))}
            </ol>
          </section>
          {CUSTOMER_CANCELLABLE.includes(booking.status) ? (
            <>
              <p className="text-xs text-sand-600">
                {t("detail.cancellationPolicyHint", {
                  hours: settings.cancellationFreeHours,
                  percent: settings.cancellationLateFeeBps / 100,
                })}
              </p>
              <CancelBookingForm bookingId={booking.id} />
            </>
          ) : null}
          {booking.status === "ACTIVE" ? (
            <ExtensionForm
              bookingId={booking.id}
              minDate={localDateTimeParts(booking.endAt).date}
            />
          ) : null}
        </div>
        <aside>
          {snapshot ? (
            <QuoteBreakdown
              quote={{
                rentalDays: snapshot.rentalDays,
                totalRentalXaf: snapshot.totalRentalXaf,
                securityDepositXaf: snapshot.securityDepositXaf,
                lines: breakdown.lines,
                grandTotalXaf: breakdown.grandTotalXaf,
                promoRejectedReason: null,
              }}
            />
          ) : null}
        </aside>
      </div>
    </Container>
  );
}
