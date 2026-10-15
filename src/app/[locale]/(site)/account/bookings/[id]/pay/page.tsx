import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Container, PageHeader } from "@/components/ui/container";
import { AccountNav } from "@/features/account/account-nav";
import { BookingError, getBookingForCustomer } from "@/features/bookings/service";
import { PaymentMethodLabel, PaymentStatusBadge } from "@/features/payments/payment-badge";
import {
  PaymentMethodForm,
  PaymentStatusPanel,
  type MethodOption,
} from "@/features/payments/customer-forms";
import {
  OPEN_PAYMENT_STATUSES,
  amountDueForBooking,
  listPaymentsForBooking,
} from "@/features/payments/service";
import { getPaymentSettings } from "@/features/payments/settings";
import { formatXaf } from "@/lib/money";
import { requireUser } from "@/server/auth/session";
import { listAvailableMethods } from "@/server/payments/registry";

type Props = {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ payment?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "payments" });
  return { title: t("metaTitle") };
}

export default async function PayBookingPage({ params, searchParams }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const { user } = await requireUser(`/account/bookings/${id}/pay`);
  let booking: Awaited<ReturnType<typeof getBookingForCustomer>>;
  try {
    booking = await getBookingForCustomer(id, user.id);
  } catch (error) {
    if (error instanceof BookingError) notFound();
    throw error;
  }
  const t = await getTranslations("payments");
  const currentLocale = (await getLocale()) === "en" ? "en" : "fr";
  const format = await getFormatter();
  const sp = await searchParams;
  const payments = await listPaymentsForBooking(booking.id);
  const due = booking.priceSnapshots[0]
    ? await amountDueForBooking(booking.id)
    : { amountXaf: 0, depositXaf: 0, totalRentalXaf: 0 };
  const open = payments.find((p) => OPEN_PAYMENT_STATUSES.includes(p.status));
  const focus = (sp.payment ? payments.find((p) => p.id === sp.payment) : undefined) ?? open;
  const settings = await getPaymentSettings();
  const methods = (await listAvailableMethods()).filter(
    (m) => m.customerSelectable,
  ) as MethodOption[];

  return (
    <Container className="py-10">
      <PageHeader title={t("title", { reference: booking.reference })} />
      <AccountNav current="bookings" />
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {booking.status !== "PAYMENT_PENDING" ? (
            <Alert tone={booking.status === "CONFIRMED" ? "success" : "info"}>
              {booking.status === "CONFIRMED" ? t("alreadyPaid") : t("notPayable")}{" "}
              <ButtonLink href={`/account/bookings/${booking.id}`} variant="ghost" size="sm">
                {t("backToBooking")} →
              </ButtonLink>
            </Alert>
          ) : focus ? (
            <section className="space-y-3 rounded-xl border border-sand-200 bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">
                  <PaymentMethodLabel method={focus.method} /> ·{" "}
                  {formatXaf(focus.amountXaf, currentLocale)}
                </h2>
                <PaymentStatusBadge status={focus.status} />
              </div>
              {OPEN_PAYMENT_STATUSES.includes(focus.status) ? (
                <Alert tone="warning" title={t("waitingTitle")}>
                  {focus.method === "BANK_TRANSFER"
                    ? t("waitingBank")
                    : focus.method === "CARD"
                      ? t("waitingCard")
                      : t("waitingMomo")}
                  {focus.expiresAt
                    ? ` ${t("expires", { time: format.dateTime(focus.expiresAt, "full") })}`
                    : ""}
                </Alert>
              ) : (
                <Alert tone="danger" title={t("failedTitle")}>
                  {t("failedBody")}
                </Alert>
              )}
              <PaymentStatusPanel
                paymentId={focus.id}
                status={focus.status}
                instruction={
                  focus.method === "BANK_TRANSFER"
                    ? settings.bankTransferInstructions[currentLocale]
                    : focus.providerEnvironment === "mock"
                      ? null
                      : focus.customerInstruction
                }
                isMock={focus.providerEnvironment === "mock"}
              />
              {!OPEN_PAYMENT_STATUSES.includes(focus.status) ? (
                <ButtonLink href={`/account/bookings/${booking.id}/pay`} variant="outline">
                  {t("tryAgain")}
                </ButtonLink>
              ) : null}
            </section>
          ) : (
            <section className="space-y-3 rounded-xl border border-sand-200 bg-white p-5">
              <h2 className="text-lg font-semibold">
                {t("amountDue", { amount: formatXaf(due.amountXaf, currentLocale) })}
              </h2>
              <p className="text-sm text-sand-700">
                {t("depositNotice", { amount: formatXaf(due.depositXaf, currentLocale) })}
              </p>
              {methods.length === 0 ? (
                <Alert tone="warning">{t("noMethods")}</Alert>
              ) : (
                <PaymentMethodForm
                  bookingId={booking.id}
                  methods={methods}
                  defaultPhone={user.phoneNumber ?? ""}
                />
              )}
            </section>
          )}
          {payments.length > 0 ? (
            <section>
              <h2 className="text-lg font-semibold">{t("history")}</h2>
              <ul className="mt-2 divide-y divide-sand-200 rounded-xl border border-sand-200 bg-white text-sm">
                {payments.map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                  >
                    <span>
                      <PaymentMethodLabel method={p.method} /> ·{" "}
                      {formatXaf(p.amountXaf, currentLocale)}
                      <span className="block text-xs text-sand-500">
                        {format.dateTime(p.createdAt, "full")}
                      </span>
                    </span>
                    <PaymentStatusBadge status={p.status} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
        <aside className="space-y-2 rounded-xl border border-sand-200 bg-white p-5 text-sm">
          <h2 className="font-semibold">{t("summary")}</h2>
          <dl className="space-y-1">
            <div className="flex justify-between">
              <dt>{t("rental")}</dt>
              <dd>{formatXaf(due.totalRentalXaf, currentLocale)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>{t("deposit")}</dt>
              <dd>{formatXaf(due.depositXaf, currentLocale)}</dd>
            </div>
            <div className="flex justify-between font-semibold">
              <dt>{t("total")}</dt>
              <dd>{formatXaf(due.amountXaf, currentLocale)}</dd>
            </div>
          </dl>
          <p className="text-xs text-sand-600">{t("securityNote")}</p>
        </aside>
      </div>
    </Container>
  );
}
