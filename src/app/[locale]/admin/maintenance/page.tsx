import { getFormatter, getLocale, getTranslations, setRequestLocale } from "next-intl/server";

import { Badge } from "@/components/ui/alert";
import { listMaintenanceForAdmin } from "@/features/maintenance/service";
import { Link } from "@/i18n/navigation";
import { formatXaf } from "@/lib/money";
import { requirePermission } from "@/server/auth/session";

import type { MaintenanceStatus } from "@/generated/prisma/enums";

const STATUSES: Array<MaintenanceStatus | "ALL"> = [
  "ALL",
  "SCHEDULED",
  "QUOTE_REQUESTED",
  "AWAITING_OWNER_APPROVAL",
  "APPROVED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
];

export default async function AdminMaintenancePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePermission("maintenance.manage", "/admin/maintenance");
  const sp = await searchParams;
  const t = await getTranslations("maintenance");
  const currentLocale = (await getLocale()) === "en" ? "en" : "fr";
  const format = await getFormatter();
  const status = (STATUSES.includes(sp.status as MaintenanceStatus) ? sp.status : "ALL") as
    MaintenanceStatus | "ALL";
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const result = await listMaintenanceForAdmin({ status, page });
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-sand-900">{t("admin.title")}</h1>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t("admin.dueSoon")}</h2>
        {result.dueSoon.length === 0 ? (
          <p className="text-sm text-sand-600">{t("admin.nothingDue")}</p>
        ) : null}
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {result.dueSoon.map((s) => (
            <li
              key={s.id}
              className="rounded-lg border border-accent-500/40 bg-accent-50 px-4 py-3 text-sm"
            >
              <Link
                href={`/admin/vehicles/${s.vehicle.id}`}
                className="font-semibold text-brand-700 hover:underline"
              >
                {s.vehicle.make} {s.vehicle.model} · {s.vehicle.registrationNumber}
              </Link>
              <p>
                {t(`types.${s.type}`)} ·{" "}
                {s.nextDueDate ? format.dateTime(s.nextDueDate, "short") : ""}
                {s.nextDueKm ? ` · ${s.nextDueKm} km (${s.vehicle.currentMileageKm} km)` : ""}
              </p>
            </li>
          ))}
        </ul>
      </section>
      <nav className="flex flex-wrap gap-2" aria-label="Status filter">
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={`/admin/maintenance?status=${s}`}
            aria-current={s === status ? "page" : undefined}
            className={
              s === status
                ? "rounded-full bg-brand-600 px-3 py-1 text-sm font-semibold text-white"
                : "rounded-full bg-white px-3 py-1 text-sm text-sand-700 ring-1 ring-sand-200"
            }
          >
            {s === "ALL" ? t("admin.all") : t(`statuses.${s}`)}
          </Link>
        ))}
      </nav>
      <div className="overflow-x-auto rounded-xl border border-sand-200 bg-white" tabIndex={0}>
        <table className="min-w-full text-sm">
          <thead className="bg-sand-100 text-left text-xs tracking-wide text-sand-600 uppercase">
            <tr>
              <th className="px-4 py-3">{t("admin.vehicle")}</th>
              <th className="px-4 py-3">{t("title")}</th>
              <th className="px-4 py-3">{t("scheduledFor")}</th>
              <th className="px-4 py-3">{t("quoteXaf")}</th>
              <th className="px-4 py-3">{t("admin.status")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-sand-200">
            {result.records.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sand-600">
                  {t("admin.none")}
                </td>
              </tr>
            ) : null}
            {result.records.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/vehicles/${r.vehicle.id}#maintenance`}
                    className="text-brand-700 hover:underline"
                  >
                    {r.vehicle.make} {r.vehicle.model} · {r.vehicle.registrationNumber}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  {t(`types.${r.type}`)} · {r.title}
                </td>
                <td className="px-4 py-3 text-xs text-sand-600">
                  {r.scheduledFor ? format.dateTime(r.scheduledFor, "short") : "—"}
                </td>
                <td className="px-4 py-3">
                  {r.finalCostXaf
                    ? formatXaf(r.finalCostXaf, currentLocale)
                    : r.quoteXaf
                      ? formatXaf(r.quoteXaf, currentLocale)
                      : "—"}
                </td>
                <td className="px-4 py-3">
                  <Badge
                    tone={
                      r.status === "COMPLETED"
                        ? "good"
                        : r.status === "CANCELLED"
                          ? "neutral"
                          : r.status === "IN_PROGRESS"
                            ? "brand"
                            : "warn"
                    }
                  >
                    {t(`statuses.${r.status}`)}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
