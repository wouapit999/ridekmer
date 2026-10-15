import { useLocale, useTranslations } from "next-intl";

import { formatXaf } from "@/lib/money";

import type { Quote } from "@/features/pricing/engine";

export type QuoteLike = Pick<
  Quote,
  "rentalDays" | "totalRentalXaf" | "securityDepositXaf" | "lines" | "promoRejectedReason"
> & { grandTotalXaf: number };

export function QuoteBreakdown({
  quote,
  showOwnerShare,
  ownerShareXaf,
}: {
  quote: QuoteLike;
  showOwnerShare?: boolean;
  ownerShareXaf?: number;
}) {
  const t = useTranslations("cars.quote");
  const locale = useLocale();
  const label = (key: string, detail?: string) => {
    const base = key.startsWith("addon:")
      ? key.slice(6)
      : t.has(key as "base")
        ? t(key as "base")
        : key;
    if (key === "base" && detail)
      return `${base} (${t(`detail.${detail.startsWith("daily") ? "daily" : "package"}`)})`;
    if (detail && key !== "base") return `${base} (${detail})`;
    return base;
  };
  return (
    <div className="rounded-xl border border-sand-200 bg-white p-5">
      <h2 className="text-lg font-semibold">{t("title")}</h2>
      <p className="text-sm text-sand-600">{t("days", { count: quote.rentalDays })}</p>
      <dl className="mt-3 space-y-1 text-sm">
        {quote.lines.map((line, i) => (
          <div key={`${line.key}-${i}`} className="flex justify-between gap-3">
            <dt className="text-sand-700">{label(line.key, line.detail)}</dt>
            <dd className={line.amountXaf < 0 ? "text-success-600" : ""}>
              {formatXaf(line.amountXaf, locale)}
            </dd>
          </div>
        ))}
        <div className="flex justify-between gap-3 border-t border-sand-200 pt-2 font-semibold">
          <dt>{t("total")}</dt>
          <dd>{formatXaf(quote.totalRentalXaf, locale)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-sand-700">{t("deposit")}</dt>
          <dd>{formatXaf(quote.securityDepositXaf, locale)}</dd>
        </div>
        <div className="flex justify-between gap-3 border-t border-sand-200 pt-2 text-base font-bold text-brand-700">
          <dt>{t("grandTotal")}</dt>
          <dd>{formatXaf(quote.grandTotalXaf, locale)}</dd>
        </div>
        {showOwnerShare && ownerShareXaf !== undefined ? (
          <div className="flex justify-between gap-3 text-xs text-sand-600">
            <dt>{t("owner")}</dt>
            <dd>{formatXaf(ownerShareXaf, locale)}</dd>
          </div>
        ) : null}
      </dl>
      {quote.promoRejectedReason ? (
        <p className="mt-2 text-sm text-accent-700">{t("promoRejected")}</p>
      ) : null}
    </div>
  );
}
