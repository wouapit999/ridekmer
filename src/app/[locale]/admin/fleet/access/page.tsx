import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";

import { listAccessLogs } from "@/features/tracking/queries";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/server/auth/session";

export default async function AdminTrackingAccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ vehicle?: string; page?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePermission("audit.view", "/admin/fleet/access");
  const sp = await searchParams;
  const t = await getTranslations("tracking.access");
  const format = await getFormatter();
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const result = await listAccessLogs({ vehicleId: sp.vehicle || undefined, page });
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-sand-900">{t("title")}</h1>
        <Link href="/admin/fleet" className="text-sm text-brand-700 hover:underline">
          ← {t("backToFleet")}
        </Link>
      </div>
      <p className="text-sm text-sand-700">{t("intro")}</p>
      <div className="overflow-x-auto rounded-xl border border-sand-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-sand-100 text-left text-xs tracking-wide text-sand-600 uppercase">
            <tr>
              <th className="px-4 py-3">{t("when")}</th>
              <th className="px-4 py-3">{t("who")}</th>
              <th className="px-4 py-3">{t("what")}</th>
              <th className="px-4 py-3">{t("vehicle")}</th>
              <th className="px-4 py-3">{t("range")}</th>
              <th className="px-4 py-3">{t("reason")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-sand-200">
            {result.logs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sand-600">
                  {t("none")}
                </td>
              </tr>
            ) : null}
            {result.logs.map((l) => (
              <tr key={l.id}>
                <td className="px-4 py-2 font-mono text-xs">
                  {format.dateTime(l.createdAt, "full")}
                </td>
                <td className="px-4 py-2">
                  {l.user.name}
                  <span className="block text-xs text-sand-600">{l.user.email}</span>
                </td>
                <td className="px-4 py-2 text-xs">{t(`types.${l.accessType}`)}</td>
                <td className="px-4 py-2 font-mono text-xs">{l.vehicleId}</td>
                <td className="px-4 py-2 text-xs">
                  {l.rangeStart
                    ? `${format.dateTime(l.rangeStart, "short")} → ${l.rangeEnd ? format.dateTime(l.rangeEnd, "short") : ""}`
                    : "—"}
                </td>
                <td className="px-4 py-2 text-xs">{l.reason ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-sand-600">
        {t("count", { total: result.total, page, pages: result.pages })}
      </p>
    </div>
  );
}
