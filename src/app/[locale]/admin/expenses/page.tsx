import { getFormatter, getLocale, getTranslations, setRequestLocale } from "next-intl/server";

import { Badge } from "@/components/ui/alert";
import { listExpensesForAdmin } from "@/features/finance/expenses";
import { ExpenseDecisionForm } from "@/features/finance/forms";
import { Link } from "@/i18n/navigation";
import { enumLabel } from "@/lib/i18n-enum";
import { formatXaf } from "@/lib/money";
import { requirePermission } from "@/server/auth/session";

import type { ExpenseStatus } from "@/generated/prisma/enums";

const STATUSES: Array<ExpenseStatus | "ALL"> = [
  "ALL",
  "PENDING",
  "AWAITING_OWNER_APPROVAL",
  "APPROVED",
  "ALLOCATED",
  "REJECTED",
];

export default async function AdminExpensesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePermission("expense.approve", "/admin/expenses");
  const sp = await searchParams;
  const t = await getTranslations("finance.expenses");
  const tm = await getTranslations("maintenance");
  const currentLocale = (await getLocale()) === "en" ? "en" : "fr";
  const format = await getFormatter();
  const status = (STATUSES.includes(sp.status as ExpenseStatus) ? sp.status : "PENDING") as
    ExpenseStatus | "ALL";
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const result = await listExpensesForAdmin({ status, page });
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-sand-900">{t("title")}</h1>
      <nav className="flex flex-wrap gap-2" aria-label="Status filter">
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={`/admin/expenses?status=${s}`}
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
        {result.expenses.length === 0 ? (
          <li className="text-sm text-sand-600">{t("none")}</li>
        ) : null}
        {result.expenses.map((e) => (
          <li
            key={e.id}
            className="space-y-2 rounded-xl border border-sand-200 bg-white p-4 text-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">
                <Link
                  href={`/admin/vehicles/${e.vehicle.id}#maintenance`}
                  className="text-brand-700 hover:underline"
                >
                  {e.vehicle.make} {e.vehicle.model} · {e.vehicle.registrationNumber}
                </Link>{" "}
                · {formatXaf(e.amountXaf, currentLocale)}
              </span>
              <Badge
                tone={
                  e.status === "ALLOCATED" ? "good" : e.status === "REJECTED" ? "danger" : "warn"
                }
              >
                {t(`statuses.${e.status}`)}
              </Badge>
            </div>
            <p className="text-xs text-sand-600">
              {enumLabel(tm, "types", e.category)} · {e.description}
              {e.maintenanceRecord ? ` · ${e.maintenanceRecord.title}` : ""} ·{" "}
              {format.dateTime(e.incurredOn, "short")} · {e.ownerProfile?.displayName ?? "RideKmer"}
              {e.status === "ALLOCATED"
                ? ` · ${t(`allocations.${e.allocation}`)} (${t("ownerShareXaf")}: ${formatXaf(e.ownerShareXaf, currentLocale)}) · ${e.approvedBy?.name ?? ""}`
                : ""}
            </p>
            {["PENDING", "AWAITING_OWNER_APPROVAL", "APPROVED"].includes(e.status) ? (
              <ExpenseDecisionForm
                expenseId={e.id}
                amountXaf={e.amountXaf}
                hasOwner={e.vehicle.ownershipModel !== "RIDEKMER_OWNED"}
              />
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
