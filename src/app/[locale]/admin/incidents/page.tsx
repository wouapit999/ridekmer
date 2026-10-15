import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";

import { Badge } from "@/components/ui/alert";
import { listIncidentsForAdmin } from "@/features/incidents/service";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/server/auth/session";

import type { IncidentStatus } from "@/generated/prisma/enums";

const STATUSES: Array<IncidentStatus | "ALL"> = [
  "ALL",
  "REPORTED",
  "UNDER_REVIEW",
  "AWAITING_DOCUMENTS",
  "RESPONSIBILITY_REVIEW",
  "DISPUTED",
  "RESOLVED",
  "CLOSED",
];

export default async function AdminIncidentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePermission("incident.manage", "/admin/incidents");
  const sp = await searchParams;
  const t = await getTranslations("incidents");
  const format = await getFormatter();
  const status = (STATUSES.includes(sp.status as IncidentStatus) ? sp.status : "ALL") as
    IncidentStatus | "ALL";
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const result = await listIncidentsForAdmin({ status, page });
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-sand-900">{t("admin.title")}</h1>
      <nav className="flex flex-wrap gap-2" aria-label="Status filter">
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={`/admin/incidents?status=${s}`}
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
              <th className="px-4 py-3">{t("admin.reference")}</th>
              <th className="px-4 py-3">{t("type")}</th>
              <th className="px-4 py-3">{t("admin.vehicle")}</th>
              <th className="px-4 py-3">{t("admin.booking")}</th>
              <th className="px-4 py-3">{t("occurredAt")}</th>
              <th className="px-4 py-3">{t("admin.status")}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-sand-200">
            {result.incidents.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-sand-600">
                  {t("admin.none")}
                </td>
              </tr>
            ) : null}
            {result.incidents.map((i) => (
              <tr key={i.id}>
                <td className="px-4 py-3 font-mono text-xs">{i.reference}</td>
                <td className="px-4 py-3">{t(`types.${i.type}`)}</td>
                <td className="px-4 py-3">
                  {i.vehicle.make} {i.vehicle.model} · {i.vehicle.registrationNumber}
                </td>
                <td className="px-4 py-3 font-mono text-xs">{i.booking?.reference ?? "—"}</td>
                <td className="px-4 py-3 text-xs text-sand-600">
                  {format.dateTime(i.occurredAt, "full")}
                </td>
                <td className="px-4 py-3">
                  <Badge
                    tone={
                      i.status === "CLOSED" || i.status === "RESOLVED"
                        ? "good"
                        : i.status === "DISPUTED"
                          ? "danger"
                          : "warn"
                    }
                  >
                    {t(`statuses.${i.status}`)}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/admin/incidents/${i.id}`}
                    className="font-medium text-brand-700 hover:underline"
                  >
                    {t("admin.open")}
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
