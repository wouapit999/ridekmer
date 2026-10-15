import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { ButtonLink } from "@/components/ui/button";
import { Container, PageHeader } from "@/components/ui/container";
import { getStatementForOwner, type StatementLine } from "@/features/finance/statements";
import { requireOwnerPage } from "@/features/owner/guards";
import { OwnerNav } from "@/features/owner/owner-nav";
import { formatXaf } from "@/lib/money";

export default async function OwnerStatementPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const { profile } = await requireOwnerPage(`/owner/finance/statements/${id}`);
  const statement = await getStatementForOwner(id, profile.id);
  if (!statement) notFound();
  const t = await getTranslations("finance.statements");
  const currentLocale = (await getLocale()) === "en" ? "en" : "fr";
  const xaf = (n: number) => formatXaf(n, currentLocale);
  const lines = statement.lines as unknown as StatementLine[];
  return (
    <Container className="py-10">
      <PageHeader
        title={t("pageTitle", { period: statement.key.split(":")[1] ?? "" })}
        intro={profile.displayName}
      />
      <OwnerNav current="finance" />
      <div className="mt-6 space-y-4">
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/owner/finance" variant="ghost" size="sm">
            ← {t("back")}
          </ButtonLink>
          <a
            href={`/api/owner/statements/${statement.id}`}
            className="inline-flex min-h-11 items-center rounded-md border border-sand-300 bg-white px-4 text-sm font-semibold"
          >
            {t("downloadCsv")}
          </a>
        </div>
        <dl className="grid gap-3 rounded-xl border border-sand-200 bg-white p-5 text-sm sm:grid-cols-3 lg:grid-cols-6">
          <div>
            <dt className="text-sand-600">{t("opening")}</dt>
            <dd className="font-semibold tabular-nums">{xaf(statement.openingBalanceXaf)}</dd>
          </div>
          <div>
            <dt className="text-sand-600">{t("earnings")}</dt>
            <dd className="font-semibold text-success-600 tabular-nums">
              {xaf(statement.earningsXaf)}
            </dd>
          </div>
          <div>
            <dt className="text-sand-600">{t("refunds")}</dt>
            <dd className="font-semibold tabular-nums">{xaf(statement.refundsXaf)}</dd>
          </div>
          <div>
            <dt className="text-sand-600">{t("expenses")}</dt>
            <dd className="font-semibold tabular-nums">{xaf(statement.expensesXaf)}</dd>
          </div>
          <div>
            <dt className="text-sand-600">{t("payouts")}</dt>
            <dd className="font-semibold tabular-nums">{xaf(statement.payoutsXaf)}</dd>
          </div>
          <div>
            <dt className="text-sand-600">{t("closing")}</dt>
            <dd className="font-semibold tabular-nums">{xaf(statement.closingBalanceXaf)}</dd>
          </div>
        </dl>
        <div className="overflow-x-auto rounded-xl border border-sand-200 bg-white" tabIndex={0}>
          <table className="min-w-full text-sm">
            <thead className="bg-sand-100 text-left text-xs tracking-wide text-sand-600 uppercase">
              <tr>
                <th className="px-4 py-3">{t("date")}</th>
                <th className="px-4 py-3">{t("type")}</th>
                <th className="px-4 py-3">{t("description")}</th>
                <th className="px-4 py-3 text-right">{t("credit")}</th>
                <th className="px-4 py-3 text-right">{t("debit")}</th>
                <th className="px-4 py-3 text-right">{t("balance")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-200">
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-sand-600">
                    {t("noLines")}
                  </td>
                </tr>
              ) : null}
              {lines.map((l, i) => (
                <tr key={i}>
                  <td className="px-4 py-2 font-mono text-xs">{l.date}</td>
                  <td className="px-4 py-2 text-xs">{l.type}</td>
                  <td className="px-4 py-2 text-xs">
                    {l.description}
                    {l.reference ? ` · ${l.reference}` : ""}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {l.creditXaf ? xaf(l.creditXaf) : ""}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {l.debitXaf ? xaf(l.debitXaf) : ""}
                  </td>
                  <td className="px-4 py-2 text-right font-semibold tabular-nums">
                    {xaf(l.balanceXaf)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Container>
  );
}
