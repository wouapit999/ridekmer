import { getFormatter, getLocale, getTranslations, setRequestLocale } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { PaymentMethodLabel, PaymentStatusBadge } from "@/features/payments/payment-badge";
import { listPaymentsForAdmin } from "@/features/payments/queries";
import { Link } from "@/i18n/navigation";
import { formatXaf } from "@/lib/money";
import { requirePermission } from "@/server/auth/session";

import type { PaymentMethod, PaymentStatus } from "@/generated/prisma/enums";

const STATUSES: Array<PaymentStatus | "ALL"> = [
  "ALL",
  "PENDING",
  "REQUIRES_CUSTOMER_ACTION",
  "PROCESSING",
  "SUCCESSFUL",
  "FAILED",
  "EXPIRED",
  "PARTIALLY_REFUNDED",
  "REFUNDED",
];
const METHODS: Array<PaymentMethod | "ALL"> = [
  "ALL",
  "MTN_MOBILE_MONEY",
  "ORANGE_MONEY",
  "CARD",
  "BANK_TRANSFER",
  "CASH",
];

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string; method?: string; q?: string; page?: string }>;
};

export default async function AdminPaymentsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePermission("payment.view", "/admin/payments");
  const sp = await searchParams;
  const t = await getTranslations("payments.admin");
  const ts = await getTranslations("payments.statuses");
  const tm = await getTranslations("payments.methods");
  const currentLocale = (await getLocale()) === "en" ? "en" : "fr";
  const format = await getFormatter();
  const status = (STATUSES.includes(sp.status as PaymentStatus) ? sp.status : "ALL") as
    PaymentStatus | "ALL";
  const method = (METHODS.includes(sp.method as PaymentMethod) ? sp.method : "ALL") as
    PaymentMethod | "ALL";
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const result = await listPaymentsForAdmin({ status, method, q: sp.q?.trim() || undefined, page });
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-sand-900">{t("title")}</h1>
      <nav className="flex flex-wrap gap-2" aria-label="Status filter">
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={`/admin/payments?status=${s}&method=${method}`}
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
      <form method="get" className="flex max-w-2xl flex-wrap gap-2" role="search">
        <input type="hidden" name="status" value={status} />
        <label htmlFor="method" className="sr-only">
          {t("method")}
        </label>
        <Select id="method" name="method" defaultValue={method} className="max-w-56">
          {METHODS.map((m) => (
            <option key={m} value={m}>
              {m === "ALL" ? t("allMethods") : tm(m)}
            </option>
          ))}
        </Select>
        <label htmlFor="q" className="sr-only">
          {t("search")}
        </label>
        <Input id="q" name="q" defaultValue={sp.q} placeholder={t("search")} className="max-w-sm" />
        <Button type="submit" variant="outline">
          →
        </Button>
      </form>
      <div className="overflow-x-auto rounded-xl border border-sand-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-sand-100 text-left text-xs tracking-wide text-sand-600 uppercase">
            <tr>
              <th className="px-4 py-3">{t("date")}</th>
              <th className="px-4 py-3">{t("booking")}</th>
              <th className="px-4 py-3">{t("method")}</th>
              <th className="px-4 py-3">{t("provider")}</th>
              <th className="px-4 py-3">{t("amountXaf")}</th>
              <th className="px-4 py-3">{t("status")}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-sand-200">
            {result.payments.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-sand-600">
                  {t("noResults")}
                </td>
              </tr>
            ) : null}
            {result.payments.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-3 text-xs text-sand-600">
                  {format.dateTime(p.createdAt, "full")}
                </td>
                <td className="px-4 py-3 font-mono text-xs">
                  {p.booking ? (
                    <Link
                      href={`/admin/bookings/${p.booking.id}`}
                      className="text-brand-700 hover:underline"
                    >
                      {p.booking.reference}
                    </Link>
                  ) : (
                    "—"
                  )}
                  <span className="block text-sand-600">{p.booking?.customer.name}</span>
                </td>
                <td className="px-4 py-3">
                  <PaymentMethodLabel method={p.method} />
                </td>
                <td className="px-4 py-3 text-xs">
                  {p.provider}
                  {p.providerEnvironment === "mock" ? (
                    <span className="ml-1 rounded bg-accent-100 px-1 text-accent-700">mock</span>
                  ) : null}
                </td>
                <td className="px-4 py-3 font-semibold">{formatXaf(p.amountXaf, currentLocale)}</td>
                <td className="px-4 py-3">
                  <PaymentStatusBadge status={p.status} />
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/admin/payments/${p.id}`}
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
      {result.pages > 1 ? (
        <nav className="flex gap-2 text-sm" aria-label="Pagination">
          {Array.from({ length: result.pages }, (_, i) => i + 1).map((n) => (
            <Link
              key={n}
              href={`/admin/payments?status=${status}&method=${method}&q=${sp.q ?? ""}&page=${n}`}
              aria-current={n === page ? "page" : undefined}
              className={n === page ? "font-bold text-brand-700" : "text-sand-700"}
            >
              {n}
            </Link>
          ))}
        </nav>
      ) : null}
    </div>
  );
}
