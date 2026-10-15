import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/alert";
import { ManualPaymentForm } from "@/features/payments/admin-forms";
import { PaymentMethodLabel, PaymentStatusBadge } from "@/features/payments/payment-badge";
import { getPaymentSettings } from "@/features/payments/settings";
import { formatXaf } from "@/lib/money";
import { StaffTransitionForm } from "@/features/bookings/admin-forms";
import { BookingStatusBadge } from "@/features/bookings/booking-badge";
import { getBookingForAdmin } from "@/features/bookings/queries";
import { QuoteBreakdown } from "@/features/bookings/quote-breakdown";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/server/auth/session";

export default async function AdminBookingDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const { access } = await requirePermission("booking.view_all", `/admin/bookings/${id}`);
  const booking = await getBookingForAdmin(id);
  if (!booking) notFound();
  const t = await getTranslations("admin.bookings");
  const tp = await getTranslations("payments.admin");
  const format = await getFormatter();
  const paymentSettings = await getPaymentSettings();
  const manualMethods = [
    ...(paymentSettings.cashEnabled ? (["CASH"] as const) : []),
    ...(paymentSettings.bankTransferEnabled ? (["BANK_TRANSFER"] as const) : []),
  ];
  const snapshot = booking.priceSnapshots[0];
  const breakdown = (snapshot?.breakdown ?? { lines: [], grandTotalXaf: 0 }) as {
    lines: Array<{ key: string; amountXaf: number; detail?: string }>;
    grandTotalXaf: number;
  };
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-sand-900">
          {t("detailTitle", { reference: booking.reference })}
        </h1>
        <BookingStatusBadge status={booking.status} />
      </div>
      <dl className="grid gap-3 rounded-xl border border-sand-200 bg-white p-5 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-sand-600">{t("customer")}</dt>
          <dd className="font-medium">
            <Link
              href={`/admin/users/${booking.customer.id}`}
              className="text-brand-700 hover:underline"
            >
              {booking.customer.name}
            </Link>
            <br />
            <span className="text-xs text-sand-600">
              {booking.customer.email} · {booking.customer.phoneNumber ?? "—"}
            </span>
            <br />
            <Badge tone={booking.customer.customerProfile?.approvedAt ? "good" : "warn"}>
              {booking.customer.customerProfile?.approvedAt
                ? t("customerVerified")
                : t("customerUnverified")}
            </Badge>
          </dd>
        </div>
        <div>
          <dt className="text-sand-600">{t("vehicle")}</dt>
          <dd className="font-medium">
            <Link
              href={`/admin/vehicles/${booking.vehicle.id}`}
              className="text-brand-700 hover:underline"
            >
              {booking.vehicle.make} {booking.vehicle.model} · {booking.vehicle.registrationNumber}
            </Link>
            <br />
            <span className="text-xs text-sand-600">
              {t("owner")}: {booking.vehicle.ownerProfile?.displayName ?? "RideKmer"}
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-sand-600">{t("dates")}</dt>
          <dd className="font-medium">
            {format.dateTime(booking.startAt, "full")} → {format.dateTime(booking.endAt, "full")}
            <br />
            <span className="text-xs text-sand-600">
              {booking.type} · {booking.pickupMode}
              {booking.pickupAddress ? ` · ${booking.pickupAddress}` : ""}
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-sand-600">{t("status")}</dt>
          <dd className="text-xs text-sand-700">
            {booking.paymentDueAt ? `${format.dateTime(booking.paymentDueAt, "full")}` : ""}
            {booking.cancellationReason ? ` · ${booking.cancellationReason}` : ""}
            {booking.customerNotes ? ` · ${booking.customerNotes}` : ""}
          </dd>
        </div>
      </dl>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <StaffTransitionForm
            bookingId={booking.id}
            status={booking.status}
            permissions={[...access.permissions]}
            extensionUntil={
              booking.extensionRequestedEndAt
                ? format.dateTime(booking.extensionRequestedEndAt, "full")
                : undefined
            }
          />
          {booking.status === "PAYMENT_PENDING" &&
          snapshot &&
          access.permissions.has("payment.record_manual") ? (
            <ManualPaymentForm
              bookingId={booking.id}
              amountXaf={snapshot.totalRentalXaf + snapshot.securityDepositXaf}
              methods={[...manualMethods]}
            />
          ) : null}
          <section>
            <h2 className="text-lg font-semibold">{tp("title")}</h2>
            {booking.payments.length === 0 ? (
              <p className="text-sm text-sand-600">{tp("noResults")}</p>
            ) : null}
            <ul className="mt-2 divide-y divide-sand-200 rounded-xl border border-sand-200 bg-white text-sm">
              {booking.payments.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                >
                  <Link href={`/admin/payments/${p.id}`} className="text-brand-700 hover:underline">
                    <PaymentMethodLabel method={p.method} /> · {formatXaf(p.amountXaf, "fr")}
                  </Link>
                  <PaymentStatusBadge status={p.status} />
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h2 className="text-lg font-semibold">{t("history")}</h2>
            <ol className="mt-2 space-y-1 text-sm">
              {booking.statusHistory.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center gap-2 text-sand-700">
                  <span className="font-mono text-xs text-sand-500">
                    {format.dateTime(h.createdAt, "full")}
                  </span>
                  <BookingStatusBadge status={h.toStatus} />
                  <span className="text-xs">{h.actor?.name ?? h.actorType}</span>
                  {h.reason ? <span>· {h.reason}</span> : null}
                </li>
              ))}
            </ol>
          </section>
        </div>
        <aside className="space-y-4">
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
              showOwnerShare
              ownerShareXaf={snapshot.ownerShareXaf}
            />
          ) : null}
          {booking.priceSnapshots.length > 1 ? (
            <p className="text-xs text-sand-600">
              {booking.priceSnapshots.length} snapshots · v{snapshot?.pricingVersion}
            </p>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
