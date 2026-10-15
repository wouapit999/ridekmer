import { getFormatter, getLocale, getTranslations, setRequestLocale } from "next-intl/server";

import { PaymentMethodLabel, RefundStatusBadge } from "@/features/payments/payment-badge";
import { listRefundsForAdmin } from "@/features/payments/refunds";
import { Link } from "@/i18n/navigation";
import { formatXaf } from "@/lib/money";
import { requireUser, requireStaffMfa } from "@/server/auth/session";
import { redirect } from "@/i18n/navigation";

import type { RefundStatus } from "@/generated/prisma/enums";

const STATUSES: Array<RefundStatus | "ALL"> = [
  "ALL",
  "PENDING_APPROVAL",
  "APPROVED",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "REJECTED",
];

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string; page?: string }>;
};

export default async function AdminRefundsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { user, access } = await requireUser("/admin/refunds");
  await requireStaffMfa(user, access);
  if (!access.permissions.has("refund.request") && !access.permissions.has("refund.approve")) {
    redirect({ href: "/account?forbidden=1", locale: await getLocale() });
  }
  const sp = await searchParams;
  const t = await getTranslations("payments.admin");
  const tr = await getTranslations("payments.refundStatuses");
  const currentLocale = (await getLocale()) === "en" ? "en" : "fr";
  const format = await getFormatter();
  const status = (STATUSES.includes(sp.status as RefundStatus) ? sp.status : "PENDING_APPROVAL") as
    RefundStatus | "ALL";
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const result = await listRefundsForAdmin({ status, page });
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-sand-900">{t("refundsTitle")}</h1>
      <nav className="flex flex-wrap gap-2" aria-label="Status filter">
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={`/admin/refunds?status=${s}`}
            aria-current={s === status ? "page" : undefined}
            className={
              s === status
                ? "rounded-full bg-brand-600 px-3 py-1 text-sm font-semibold text-white"
                : "rounded-full bg-white px-3 py-1 text-sm text-sand-700 ring-1 ring-sand-200"
            }
          >
            {s === "ALL" ? t("all") : tr(s)}
          </Link>
        ))}
      </nav>
      <div className="overflow-x-auto rounded-xl border border-sand-200 bg-white" tabIndex={0}>
        <table className="min-w-full text-sm">
          <thead className="bg-sand-100 text-left text-xs tracking-wide text-sand-600 uppercase">
            <tr>
              <th className="px-4 py-3">{t("date")}</th>
              <th className="px-4 py-3">{t("booking")}</th>
              <th className="px-4 py-3">{t("method")}</th>
              <th className="px-4 py-3">{t("amountXaf")}</th>
              <th className="px-4 py-3">{t("reason")}</th>
              <th className="px-4 py-3">{t("status")}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-sand-200">
            {result.refunds.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-sand-600">
                  {t("noRefunds")}
                </td>
              </tr>
            ) : null}
            {result.refunds.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3 text-xs text-sand-600">
                  {format.dateTime(r.createdAt, "full")}
                </td>
                <td className="px-4 py-3 font-mono text-xs">{r.booking?.reference ?? "—"}</td>
                <td className="px-4 py-3">
                  <PaymentMethodLabel method={r.payment.method} />
                </td>
                <td className="px-4 py-3 font-semibold">
                  {formatXaf(r.amountXaf, currentLocale)}
                  {r.requiresDualApproval ? (
                    <span className="block text-xs font-normal text-accent-700">
                      {t("dualApproval")}
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-xs">
                  {r.reason}
                  <span className="block text-sand-500">{r.requestedBy?.name ?? t("system")}</span>
                </td>
                <td className="px-4 py-3">
                  <RefundStatusBadge status={r.status} />
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/admin/payments/${r.paymentId}`}
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
