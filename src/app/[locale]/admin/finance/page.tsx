import { getFormatter, getLocale, getTranslations, setRequestLocale } from "next-intl/server";

import { Stat } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { LedgerCatchUpForm } from "@/features/finance/forms";
import { getFinanceDashboard, listOwnerBalances } from "@/features/finance/queries";
import { Link } from "@/i18n/navigation";
import { formatXaf } from "@/lib/money";
import { requirePermission } from "@/server/auth/session";

export default async function AdminFinancePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { access } = await requirePermission("report.view", "/admin/finance");
  const sp = await searchParams;
  const t = await getTranslations("finance.dashboard");
  const currentLocale = (await getLocale()) === "en" ? "en" : "fr";
  const format = await getFormatter();
  const [d, owners] = await Promise.all([getFinanceDashboard(sp.month), listOwnerBalances()]);
  const xaf = (n: number) => formatXaf(n, currentLocale);
  const tiles: Array<{ key: string; value: string; tone?: "default" | "warn" | "good" }> = [
    { key: "collected", value: xaf(d.collectedXaf), tone: "good" },
    { key: "revenue", value: xaf(d.revenueXaf), tone: "good" },
    { key: "tax", value: xaf(d.taxXaf) },
    { key: "expenses", value: xaf(d.expensesXaf) },
    { key: "refundsDone", value: xaf(d.refundsDoneXaf) },
    {
      key: "refundsPending",
      value: `${xaf(d.refundsPendingXaf)} (${d.refundsPendingCount})`,
      tone: d.refundsPendingCount ? "warn" : "default",
    },
    { key: "payoutsPaid", value: xaf(d.payoutsPaidXaf) },
    {
      key: "payoutsPending",
      value: `${xaf(d.payoutsPendingXaf)} (${d.payoutsPendingCount})`,
      tone: d.payoutsPendingCount ? "warn" : "default",
    },
    { key: "depositsHeld", value: xaf(d.depositsHeldXaf) },
    { key: "ownerPayables", value: xaf(d.ownerPayablesXaf) },
  ];
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold text-sand-900">{t("title")}</h1>
        <form method="get" className="flex items-end gap-2">
          <label htmlFor="month" className="text-sm text-sand-700">
            {t("month")}
          </label>
          <Input
            id="month"
            name="month"
            type="month"
            defaultValue={d.period}
            className="max-w-44"
          />
          <Button type="submit" variant="outline" size="sm">
            →
          </Button>
        </form>
      </div>
      <nav className="flex flex-wrap gap-2 text-sm">
        {access.permissions.has("ledger.view") ? (
          <Link
            href={`/admin/finance/ledger?month=${d.period}`}
            className="rounded-full bg-white px-3 py-1 ring-1 ring-sand-200 hover:bg-brand-50"
          >
            {t("ledger")}
          </Link>
        ) : null}
        <Link
          href="/admin/payouts"
          className="rounded-full bg-white px-3 py-1 ring-1 ring-sand-200 hover:bg-brand-50"
        >
          {t("payouts")}
        </Link>
        <Link
          href="/admin/expenses"
          className="rounded-full bg-white px-3 py-1 ring-1 ring-sand-200 hover:bg-brand-50"
        >
          {t("expenses")}
        </Link>
        <Link
          href="/admin/refunds"
          className="rounded-full bg-white px-3 py-1 ring-1 ring-sand-200 hover:bg-brand-50"
        >
          {t("refunds")}
        </Link>
        <Link
          href="/admin/reports"
          className="rounded-full bg-white px-3 py-1 ring-1 ring-sand-200 hover:bg-brand-50"
        >
          {t("reports")}
        </Link>
      </nav>
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => (
          <Stat
            key={tile.key}
            label={t(`tiles.${tile.key}` as "tiles.collected")}
            value={tile.value}
            tone={tile.tone}
          />
        ))}
      </dl>
      <p className="text-xs text-sand-600">
        {t("periodNote", { period: d.period, payments: d.paymentsCount, entries: d.ledgerCount })}
      </p>
      {access.permissions.has("payment.reconcile") ? <LedgerCatchUpForm /> : null}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t("ownerBalances")}</h2>
        <div className="overflow-x-auto rounded-xl border border-sand-200 bg-white" tabIndex={0}>
          <table className="min-w-full text-sm">
            <thead className="bg-sand-100 text-left text-xs tracking-wide text-sand-600 uppercase">
              <tr>
                <th className="px-4 py-3">{t("owner")}</th>
                <th className="px-4 py-3">{t("payoutMethod")}</th>
                <th className="px-4 py-3 text-right">{t("balance")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-200">
              {owners.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-sand-600">
                    {t("noOwners")}
                  </td>
                </tr>
              ) : null}
              {owners.map((o) => (
                <tr key={o.owner.id}>
                  <td className="px-4 py-3">
                    {o.owner.displayName}
                    <span className="block text-xs text-sand-600">{o.owner.user.email}</span>
                  </td>
                  <td className="px-4 py-3 text-xs">{o.owner.payoutMethod ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">
                    {xaf(o.balanceXaf)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t("recentEntries")}</h2>
        <ul className="divide-y divide-sand-200 rounded-xl border border-sand-200 bg-white text-sm">
          {d.recent.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
              <span>
                <span className="font-mono text-xs text-sand-500">
                  {format.dateTime(e.effectiveAt, "short")}
                </span>{" "}
                · {e.type} · {e.debitAccount.key} → {e.creditAccount.key} ·{" "}
                {e.booking?.reference ?? ""}
              </span>
              <span className="font-semibold tabular-nums">{xaf(e.amountXaf)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
