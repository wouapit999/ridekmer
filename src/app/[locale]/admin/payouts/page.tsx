import { getFormatter, getLocale, getTranslations, setRequestLocale } from "next-intl/server";

import { Badge } from "@/components/ui/alert";
import { PayoutDecisionForm, RequestPayoutForm } from "@/features/finance/forms";
import { listPayoutsForAdmin } from "@/features/finance/payouts";
import { listOwnerBalances } from "@/features/finance/queries";
import { ownerBalance } from "@/features/finance/ledger";
import { Link } from "@/i18n/navigation";
import { isoDateFromNow } from "@/lib/dates";
import { formatXaf } from "@/lib/money";
import { requireUser, requireStaffMfa } from "@/server/auth/session";
import { redirect } from "@/i18n/navigation";

import type { PayoutStatus } from "@/generated/prisma/enums";

const STATUSES: Array<PayoutStatus | "ALL"> = [
  "ALL",
  "PENDING_APPROVAL",
  "APPROVED",
  "PROCESSING",
  "PAID",
  "FAILED",
  "REJECTED",
];

export default async function AdminPayoutsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { user, access } = await requireUser("/admin/payouts");
  await requireStaffMfa(user, access);
  const p = access.permissions;
  if (!p.has("payout.request") && !p.has("payout.approve") && !p.has("payout.process"))
    redirect({ href: "/account?forbidden=1", locale: await getLocale() });
  const sp = await searchParams;
  const t = await getTranslations("finance.payouts");
  const currentLocale = (await getLocale()) === "en" ? "en" : "fr";
  const format = await getFormatter();
  const status = (STATUSES.includes(sp.status as PayoutStatus) ? sp.status : "ALL") as
    PayoutStatus | "ALL";
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const [result, balances] = await Promise.all([
    listPayoutsForAdmin({ status, page }),
    p.has("payout.request") ? listOwnerBalances() : Promise.resolve([]),
  ]);
  const withAvailable = await Promise.all(
    balances.map(async (b) => ({ ...b, available: (await ownerBalance(b.owner.id)).availableXaf })),
  );
  const monthStart = isoDateFromNow(-30);
  const today = isoDateFromNow(0);
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-sand-900">{t("title")}</h1>
      <nav className="flex flex-wrap gap-2" aria-label="Status filter">
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={`/admin/payouts?status=${s}`}
            aria-current={s === status ? "page" : undefined}
            className={
              s === status
                ? "rounded-full bg-brand-600 px-3 py-1 text-sm font-semibold text-white"
                : "rounded-full bg-white px-3 py-1 text-sm text-sand-700 ring-1 ring-sand-200"
            }
          >
            {s === "ALL" ? t("all") : t(`statuses.${s}`)}
          </Link>
        ))}
      </nav>
      <ul className="space-y-3">
        {result.payouts.length === 0 ? (
          <li className="text-sm text-sand-600">{t("none")}</li>
        ) : null}
        {result.payouts.map((po) => {
          const approvals = result.approvals.filter((a) => a.subjectId === po.id);
          const canDecide =
            p.has("payout.approve") &&
            po.requestedById !== user.id &&
            !approvals.some((a) => a.approverId === user.id);
          return (
            <li
              key={po.id}
              className="space-y-2 rounded-xl border border-sand-200 bg-white p-4 text-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">
                  {po.ownerProfile.displayName} · {formatXaf(po.amountXaf, currentLocale)}
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
                  {t(`statuses.${po.status}`)}
                </Badge>
              </div>
              <p className="text-xs text-sand-600">
                {t(`methods.${po.method}`)} · {po.destinationMasked ?? "—"} ·{" "}
                {format.dateTime(po.periodStart, "short")} →{" "}
                {format.dateTime(po.periodEnd, "short")} · {t("requestedBy")}:{" "}
                {po.requestedBy?.name ?? "—"} · {format.dateTime(po.createdAt, "short")}
                {po.requiresDualApproval ? ` · ${t("dualApproval")}` : ""}
                {po.providerReference ? ` · ${po.providerReference}` : ""}
                {po.failureMessage ? ` · ${po.failureMessage}` : ""}
              </p>
              {approvals.length > 0 ? (
                <p className="text-xs text-sand-600">
                  {approvals.map((a) => `${a.approver.name}: ${a.decision}`).join(" · ")}
                </p>
              ) : null}
              <PayoutDecisionForm
                payoutId={po.id}
                canDecide={canDecide}
                canProcess={p.has("payout.process")}
                status={po.status}
                manual={po.method === "BANK_TRANSFER"}
              />
            </li>
          );
        })}
      </ul>
      {p.has("payout.request") ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">{t("requestForOwner")}</h2>
          {withAvailable
            .filter((b) => b.available > 0)
            .map((b) => (
              <div key={b.owner.id}>
                <p className="mb-1 text-sm font-medium">
                  {b.owner.displayName} — {t("available")}: {formatXaf(b.available, currentLocale)}
                </p>
                <RequestPayoutForm
                  ownerProfileId={b.owner.id}
                  availableXaf={b.available}
                  defaultStart={monthStart}
                  defaultEnd={today}
                />
              </div>
            ))}
          {withAvailable.every((b) => b.available <= 0) ? (
            <p className="text-sm text-sand-600">{t("nothingAvailable")}</p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
