import { getFormatter, getLocale, getTranslations, setRequestLocale } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { BookingStatusBadge } from "@/features/bookings/booking-badge";
import { listBookingsForAdmin } from "@/features/bookings/queries";
import { Link } from "@/i18n/navigation";
import { formatXaf } from "@/lib/money";
import { requirePermission } from "@/server/auth/session";

import type { BookingStatus } from "@/generated/prisma/enums";

const STATUSES: Array<BookingStatus | "ALL"> = [
  "ALL",
  "PENDING_VERIFICATION",
  "PAYMENT_PENDING",
  "CONFIRMED",
  "READY_FOR_PICKUP",
  "ACTIVE",
  "EXTENSION_REQUESTED",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
  "DISPUTED",
];

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
};

export default async function AdminBookingsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePermission("booking.view_all", "/admin/bookings");
  const sp = await searchParams;
  const t = await getTranslations("admin.bookings");
  const ts = await getTranslations("bookings.statuses");
  const currentLocale = (await getLocale()) === "en" ? "en" : "fr";
  const format = await getFormatter();
  const status = (STATUSES.includes(sp.status as BookingStatus) ? sp.status : "ALL") as
    BookingStatus | "ALL";
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const result = await listBookingsForAdmin({ status, q: sp.q?.trim() || undefined, page });
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-sand-900">{t("title")}</h1>
      <nav className="flex flex-wrap gap-2" aria-label="Status filter">
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={`/admin/bookings?status=${s}`}
            aria-current={s === status ? "page" : undefined}
            className={
              s === status
                ? "rounded-full bg-brand-600 px-3 py-1 text-sm font-semibold text-white"
                : "rounded-full bg-white px-3 py-1 text-sm text-sand-700 ring-1 ring-sand-200"
            }
          >
            {s === "ALL" ? t("all") : ts(s)}{" "}
            {s !== "ALL" && result.counts[s] ? `(${result.counts[s]})` : ""}
          </Link>
        ))}
      </nav>
      <form method="get" className="flex max-w-lg gap-2" role="search">
        <input type="hidden" name="status" value={status} />
        <label htmlFor="q" className="sr-only">
          {t("search")}
        </label>
        <Input id="q" name="q" defaultValue={sp.q} placeholder={t("search")} />
        <Button type="submit" variant="outline">
          →
        </Button>
      </form>
      <div className="overflow-x-auto rounded-xl border border-sand-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-sand-100 text-left text-xs tracking-wide text-sand-600 uppercase">
            <tr>
              <th className="px-4 py-3">{t("reference")}</th>
              <th className="px-4 py-3">{t("customer")}</th>
              <th className="px-4 py-3">{t("vehicle")}</th>
              <th className="px-4 py-3">{t("dates")}</th>
              <th className="px-4 py-3">{t("total")}</th>
              <th className="px-4 py-3">{t("status")}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-sand-200">
            {result.bookings.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-sand-600">
                  {t("noResults")}
                </td>
              </tr>
            ) : null}
            {result.bookings.map((b) => (
              <tr key={b.id}>
                <td className="px-4 py-3 font-mono text-xs">{b.reference}</td>
                <td className="px-4 py-3">
                  {b.customer.name}
                  <br />
                  <span className="text-xs text-sand-600">{b.customer.email}</span>
                </td>
                <td className="px-4 py-3">
                  {b.vehicle.make} {b.vehicle.model}{" "}
                  <span className="text-xs text-sand-500">{b.vehicle.registrationNumber}</span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sand-700">
                  {format.dateTime(b.startAt, "short")} → {format.dateTime(b.endAt, "short")}
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {b.priceSnapshots[0]
                    ? formatXaf(b.priceSnapshots[0].totalRentalXaf, currentLocale)
                    : "—"}
                </td>
                <td className="px-4 py-3">
                  <BookingStatusBadge status={b.status} />
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/admin/bookings/${b.id}`}
                    className="font-medium text-brand-700 hover:underline"
                  >
                    {t("open")}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
