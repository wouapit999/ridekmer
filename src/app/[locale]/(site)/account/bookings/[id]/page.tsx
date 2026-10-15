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
import { PaymentMethodLabel, PaymentStatusBadge } from "@/features/payments/payment-badge";
import { listPaymentsForBooking } from "@/features/payments/service";
import { listContractsForBooking } from "@/features/contracts/service";
import { listIncidentsForBooking } from "@/features/incidents/service";
import { listInspectionsForBooking } from "@/features/inspections/service";
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
  const payments = await listPaymentsForBooking(booking.id);
  const tp = await getTranslations("payments");
  const tc = await getTranslations("contracts");
  const ti = await getTranslations("inspections");
  const tn = await getTranslations("incidents");
  const [contracts, inspections, incidents] = await Promise.all([
    listContractsForBooking(booking.id),
    listInspectionsForBooking(booking.id),
    listIncidentsForBooking(booking.id),
  ]);
  const rentalContract = contracts.find(
    (c) =>
      c.type === "CUSTOMER_RENTAL_AGREEMENT" &&
      ["SENT", "GENERATED", "ACCEPTED"].includes(c.status),
  );
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
              <p>{t("detail.paymentSoon")}</p>
              <ButtonLink href={`/account/bookings/${booking.id}/pay`} size="sm" className="mt-2">
                {t("detail.payNow")}
              </ButtonLink>
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
          {payments.length > 0 ? (
            <section>
              <h2 className="text-lg font-semibold">{tp("history")}</h2>
              <ul className="mt-2 divide-y divide-sand-200 rounded-xl border border-sand-200 bg-white text-sm">
                {payments.map((p) => (
                  <li key={p.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        <PaymentMethodLabel method={p.method} /> ·{" "}
                        {formatXaf(p.amountXaf, currentLocale)}
                      </span>
                      <PaymentStatusBadge status={p.status} />
                    </div>
                    {p.refunds.map((r) => (
                      <p key={r.id} className="mt-1 text-xs text-sand-600">
                        {tp("refundLine", {
                          amount: formatXaf(r.amountXaf, currentLocale),
                          status: tp(`refundStatuses.${r.status}`),
                        })}
                      </p>
                    ))}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {[
            "CONFIRMED",
            "READY_FOR_PICKUP",
            "ACTIVE",
            "EXTENSION_REQUESTED",
            "COMPLETED",
            "DISPUTED",
          ].includes(booking.status) ? (
            <section className="rounded-xl border border-sand-200 bg-white p-5">
              <h2 className="text-lg font-semibold">{tc("sectionTitle")}</h2>
              {rentalContract?.status === "ACCEPTED" ? (
                <p className="mt-1 text-sm text-success-600">
                  {tc("acceptedOn", { date: format.dateTime(rentalContract.acceptedAt!, "full") })}
                </p>
              ) : (
                <p className="mt-1 text-sm text-sand-700">{tc("pendingNotice")}</p>
              )}
              <ButtonLink
                href={`/account/bookings/${booking.id}/contract`}
                variant={rentalContract?.status === "ACCEPTED" ? "ghost" : "primary"}
                size="sm"
                className="mt-2"
              >
                {rentalContract?.status === "ACCEPTED" ? tc("view") : tc("readAndAccept")}
              </ButtonLink>
            </section>
          ) : null}
          {inspections.length > 0 ? (
            <section>
              <h2 className="text-lg font-semibold">{ti("sectionTitle")}</h2>
              <ul className="mt-2 divide-y divide-sand-200 rounded-xl border border-sand-200 bg-white text-sm">
                {inspections.map((i) => (
                  <li
                    key={i.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                  >
                    <span>
                      {ti(`types.${i.type}`)} · {format.dateTime(i.performedAt, "full")}
                      <span className="block text-xs text-sand-600">
                        {ti(`statuses.${i.status}`)}
                        {i.type === "RETURN" && i.deductionXaf
                          ? ` · ${ti("settlement.deduction")}: ${formatXaf(i.deductionXaf, currentLocale)}`
                          : ""}
                      </span>
                    </span>
                    {i.status !== "DRAFT" ? (
                      <ButtonLink
                        href={`/account/bookings/${booking.id}/inspections/${i.id}`}
                        variant={i.status === "SUBMITTED" ? "primary" : "ghost"}
                        size="sm"
                      >
                        {i.status === "SUBMITTED" ? ti("customer.review") : ti("customer.view")}
                      </ButtonLink>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {["ACTIVE", "EXTENSION_REQUESTED", "COMPLETED", "DISPUTED"].includes(booking.status) ||
          incidents.length > 0 ? (
            <section className="rounded-xl border border-sand-200 bg-white p-5">
              <h2 className="text-lg font-semibold">{tn("sectionTitle")}</h2>
              <ul className="mt-2 space-y-1 text-sm">
                {incidents.map((i) => (
                  <li key={i.id}>
                    <span className="font-mono text-xs">{i.reference}</span> ·{" "}
                    {tn(`types.${i.type}`)} · {tn(`statuses.${i.status}`)} ·{" "}
                    {format.dateTime(i.occurredAt, "short")}
                  </li>
                ))}
              </ul>
              {["ACTIVE", "EXTENSION_REQUESTED", "COMPLETED", "DISPUTED"].includes(
                booking.status,
              ) ? (
                <ButtonLink
                  href={`/account/bookings/${booking.id}/incidents/new`}
                  variant="outline"
                  size="sm"
                  className="mt-2"
                >
                  {tn("reportButton")}
                </ButtonLink>
              ) : null}
            </section>
          ) : null}
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
