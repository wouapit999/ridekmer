import { getFormatter, getLocale, getTranslations, setRequestLocale } from "next-intl/server";

import { Badge } from "@/components/ui/alert";
import { Card, CardTitle } from "@/components/ui/card";
import { Container, PageHeader } from "@/components/ui/container";
import { RequestPayoutForm } from "@/features/finance/forms";
import { ownerBalance } from "@/features/finance/ledger";
import { listPayoutsForOwner } from "@/features/finance/payouts";
import { listStatementsForOwner } from "@/features/finance/statements";
import { requireOwnerPage } from "@/features/owner/guards";
import { OwnerNav } from "@/features/owner/owner-nav";
import { Link } from "@/i18n/navigation";
import { isoDateFromNow } from "@/lib/dates";
import { formatXaf } from "@/lib/money";

export default async function OwnerFinancePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { profile } = await requireOwnerPage("/owner/finance");
  const t = await getTranslations("finance.owner");
  const tp = await getTranslations("finance.payouts");
  const currentLocale = (await getLocale()) === "en" ? "en" : "fr";
  const format = await getFormatter();
  const [balance, statements, payouts] = await Promise.all([
    ownerBalance(profile.id),
    listStatementsForOwner(profile.id),
    listPayoutsForOwner(profile.id),
  ]);
  const monthStart = isoDateFromNow(-30);
  const today = isoDateFromNow(0);
  return (
    <Container className="py-10">
      <PageHeader title={t("title")} intro={t("intro")} />
      <OwnerNav current="finance" />
      <div className="mt-6 space-y-6">
        <dl className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardTitle>{t("payable")}</CardTitle>
            <p className="mt-2 text-2xl font-bold tabular-nums">
              {formatXaf(balance.payableXaf, currentLocale)}
            </p>
          </Card>
          <Card>
            <CardTitle>{t("pending")}</CardTitle>
            <p className="mt-2 text-2xl font-bold tabular-nums">
              {formatXaf(balance.pendingPayoutsXaf, currentLocale)}
            </p>
          </Card>
          <Card>
            <CardTitle>{t("available")}</CardTitle>
            <p className="mt-2 text-2xl font-bold text-success-600 tabular-nums">
              {formatXaf(balance.availableXaf, currentLocale)}
            </p>
          </Card>
        </dl>
        {profile.payoutMethod ? (
          <RequestPayoutForm
            ownerProfileId={profile.id}
            availableXaf={balance.availableXaf}
            asOwner
            defaultStart={monthStart}
            defaultEnd={today}
          />
        ) : (
          <p className="text-sm text-sand-700">
            {t("noPayoutMethod")}{" "}
            <Link href="/owner/onboarding?step=payout" className="text-brand-700 underline">
              {t("setPayoutMethod")}
            </Link>
          </p>
        )}
        <section>
          <h2 className="text-lg font-semibold">{t("statements")}</h2>
          {statements.length === 0 ? (
            <p className="text-sm text-sand-600">{t("noStatements")}</p>
          ) : null}
          <ul className="mt-2 divide-y divide-sand-200 rounded-xl border border-sand-200 bg-white text-sm">
            {statements.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
              >
                <span>
                  <Link
                    href={`/owner/finance/statements/${s.id}`}
                    className="font-medium text-brand-700 hover:underline"
                  >
                    {s.key.split(":")[1]}
                  </Link>
                  <span className="block text-xs text-sand-600">
                    {t("earnings")}: {formatXaf(s.earningsXaf, currentLocale)} · {t("closing")}:{" "}
                    {formatXaf(s.closingBalanceXaf, currentLocale)}
                  </span>
                </span>
                <a
                  href={`/api/owner/statements/${s.id}`}
                  className="text-sm text-brand-700 underline"
                >
                  CSV
                </a>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className="text-lg font-semibold">{t("payouts")}</h2>
          {payouts.length === 0 ? <p className="text-sm text-sand-600">{t("noPayouts")}</p> : null}
          <ul className="mt-2 divide-y divide-sand-200 rounded-xl border border-sand-200 bg-white text-sm">
            {payouts.map((po) => (
              <li
                key={po.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
              >
                <span>
                  {formatXaf(po.amountXaf, currentLocale)} · {tp(`methods.${po.method}`)} ·{" "}
                  {po.destinationMasked ?? ""}
                  <span className="block text-xs text-sand-600">
                    {format.dateTime(po.createdAt, "short")}
                    {po.paidAt
                      ? ` · ${tp("paidOn", { date: format.dateTime(po.paidAt, "short") })}`
                      : ""}
                  </span>
                </span>
                <Badge
                  tone={
                    po.status === "PAID"
                      ? "good"
                      : po.status === "FAILED" || po.status === "REJECTED"
                        ? "danger"
                        : "warn"
                  }
                >
                  {tp(`statuses.${po.status}`)}
                </Badge>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Container>
  );
}
