import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";

import { listAuditLogs } from "@/features/admin/queries";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/server/auth/session";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ page?: string }> };

export default async function AdminAuditPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePermission("audit.view", "/admin/audit");
  const { page } = await searchParams;
  const t = await getTranslations("admin.audit");
  const currentLocale = await getLocale();
  const pageNumber = Math.max(1, Number(page ?? 1) || 1);
  const result = await listAuditLogs(pageNumber);
  const fmt = new Intl.DateTimeFormat(currentLocale === "en" ? "en-CM" : "fr-CM", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Douala",
  });
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-sand-900">{t("title")}</h1>
      <div className="overflow-x-auto rounded-xl border border-sand-200 bg-white" tabIndex={0}>
        <table className="min-w-full text-sm">
          <thead className="bg-sand-100 text-left text-xs tracking-wide text-sand-600 uppercase">
            <tr>
              <th className="px-4 py-3">{t("when")}</th>
              <th className="px-4 py-3">{t("actor")}</th>
              <th className="px-4 py-3">{t("action")}</th>
              <th className="px-4 py-3">{t("entity")}</th>
              <th className="px-4 py-3">{t("reason")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-sand-200">
            {result.entries.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sand-600">
                  {t("empty")}
                </td>
              </tr>
            ) : null}
            {result.entries.map((e) => (
              <tr key={e.id}>
                <td className="px-4 py-3 whitespace-nowrap text-sand-700">
                  {fmt.format(e.createdAt)}
                </td>
                <td className="px-4 py-3">{e.actor?.name ?? t("system")}</td>
                <td className="px-4 py-3 font-mono text-xs">{e.action}</td>
                <td className="px-4 py-3 text-sand-700">
                  {e.entityType}
                  {e.entityId ? (
                    <span className="ml-1 font-mono text-xs text-sand-500">{e.entityId}</span>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-sand-700">{e.reason ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {result.pages > 1 ? (
        <nav className="flex gap-2" aria-label="Pagination">
          {Array.from({ length: result.pages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={`/admin/audit?page=${p}`}
              aria-current={p === pageNumber ? "page" : undefined}
              className={
                p === pageNumber
                  ? "rounded-md bg-brand-600 px-3 py-1 text-sm text-white"
                  : "rounded-md border border-sand-300 px-3 py-1 text-sm"
              }
            >
              {p}
            </Link>
          ))}
        </nav>
      ) : null}
    </div>
  );
}
