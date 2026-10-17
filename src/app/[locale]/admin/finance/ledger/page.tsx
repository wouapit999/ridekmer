import { getFormatter, getLocale, getTranslations, setRequestLocale } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { AdjustmentForm, IssueStatementForm } from "@/features/finance/forms";
import { listLedgerEntries } from "@/features/finance/queries";
import { Link } from "@/i18n/navigation";
import { isoDateFromNow } from "@/lib/dates";
import { enumLabel, ledgerAccountLabel } from "@/lib/i18n-enum";
import { formatXaf } from "@/lib/money";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db";

import type { LedgerEntryType } from "@/generated/prisma/enums";

const TYPES: Array<LedgerEntryType | "ALL"> = [
  "ALL",
  "RENTAL_INCOME",
  "SECURITY_DEPOSIT",
  "DEPOSIT_REFUND",
  "REFUND",
  "PLATFORM_COMMISSION",
  "OWNER_EARNING",
  "MAINTENANCE_DEDUCTION",
  "DAMAGE_DEDUCTION",
  "FEE",
  "TAX",
  "ADJUSTMENT",
  "PAYOUT",
  "REVERSAL",
];

export default async function AdminLedgerPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ type?: string; owner?: string; month?: string; page?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePermission("ledger.view", "/admin/finance/ledger");
  const sp = await searchParams;
  const t = await getTranslations("finance.ledger");
  const te = await getTranslations("enums");
  const currentLocale = (await getLocale()) === "en" ? "en" : "fr";
  const format = await getFormatter();
  const type = (TYPES.includes(sp.type as LedgerEntryType) ? sp.type : "ALL") as
    LedgerEntryType | "ALL";
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const [result, owners] = await Promise.all([
    listLedgerEntries({
      type,
      ownerProfileId: sp.owner || undefined,
      month: sp.month || undefined,
      page,
    }),
    db.ownerProfile.findMany({
      orderBy: { displayName: "asc" },
      select: { id: true, displayName: true },
    }),
  ]);
  const ownerOptions = owners.map((o) => ({ id: o.id, name: o.displayName }));
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-sand-900">{t("title")}</h1>
        <Link href="/admin/finance" className="text-sm text-brand-700 hover:underline">
          ← {t("backToFinance")}
        </Link>
      </div>
      <form method="get" className="flex flex-wrap items-end gap-2">
        <Select name="type" defaultValue={type} className="max-w-56" aria-label={t("type")}>
          {TYPES.map((x) => (
            <option key={x} value={x}>
              {x === "ALL" ? t("allTypes") : enumLabel(te, "ledgerEntryType", x)}
            </option>
          ))}
        </Select>
        <Select
          name="owner"
          defaultValue={sp.owner ?? ""}
          className="max-w-56"
          aria-label={t("owner")}
        >
          <option value="">{t("allOwners")}</option>
          {ownerOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </Select>
        <Input
          name="month"
          type="month"
          defaultValue={sp.month ?? ""}
          className="max-w-44"
          aria-label={t("month")}
        />
        <Button type="submit" variant="outline" size="sm">
          →
        </Button>
      </form>
      <div className="overflow-x-auto rounded-xl border border-sand-200 bg-white" tabIndex={0}>
        <table className="min-w-full text-sm">
          <thead className="bg-sand-100 text-left text-xs tracking-wide text-sand-600 uppercase">
            <tr>
              <th className="px-4 py-3">{t("date")}</th>
              <th className="px-4 py-3">{t("type")}</th>
              <th className="px-4 py-3">{t("debit")}</th>
              <th className="px-4 py-3">{t("credit")}</th>
              <th className="px-4 py-3 text-right">{t("amountXaf")}</th>
              <th className="px-4 py-3">{t("description")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-sand-200">
            {result.entries.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sand-600">
                  {t("none")}
                </td>
              </tr>
            ) : null}
            {result.entries.map((e) => (
              <tr key={e.id}>
                <td className="px-4 py-2 font-mono text-xs text-sand-600">
                  {format.dateTime(e.effectiveAt, "short")}
                </td>
                <td className="px-4 py-2 text-xs">{enumLabel(te, "ledgerEntryType", e.type)}</td>
                <td className="px-4 py-2 text-xs">{ledgerAccountLabel(te, e.debitAccount.key)}</td>
                <td className="px-4 py-2 text-xs">{ledgerAccountLabel(te, e.creditAccount.key)}</td>

                <td className="px-4 py-2 text-right font-semibold tabular-nums">
                  {formatXaf(e.amountXaf, currentLocale)}
                </td>
                <td className="px-4 py-2 text-xs">
                  {e.description}
                  {e.booking ? ` · ${e.booking.reference}` : ""}
                  {e.ownerProfile ? ` · ${e.ownerProfile.displayName}` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-sand-600">
        {t("count", { total: result.total, page, pages: result.pages })}
      </p>
      {ownerOptions.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <AdjustmentForm owners={ownerOptions} />
          <IssueStatementForm
            owners={ownerOptions}
            defaultMonth={isoDateFromNow(-20).slice(0, 7)}
          />
        </div>
      ) : null}
    </div>
  );
}
