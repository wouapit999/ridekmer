import { getTranslations, setRequestLocale } from "next-intl/server";

import { Badge } from "@/components/ui/alert";
import { listDataRequestsForAdmin } from "@/features/account/privacy";
import { DataRequestActions } from "@/features/admin/data-request-forms";
import { formatIsoDate } from "@/lib/dates";
import { enumLabel } from "@/lib/i18n-enum";
import { requirePermission } from "@/server/auth/session";

type Props = { params: Promise<{ locale: string }> };

export default async function DataRequestsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { access } = await requirePermission("user.view_all", "/admin/data-requests");
  const t = await getTranslations("admin.dataRequests");
  const te = await getTranslations("enums");
  const requests = await listDataRequestsForAdmin();
  const canProcess = access.permissions.has("user.suspend");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-sand-900">{t("title")}</h1>
        <p className="mt-2 max-w-3xl text-sm text-sand-700">{t("intro")}</p>
      </div>
      {requests.length === 0 ? (
        <p className="text-sm text-sand-600">{t("none")}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-sand-200 bg-white" tabIndex={0}>
          <table className="min-w-full text-sm">
            <thead className="bg-sand-100 text-left text-xs tracking-wide text-sand-600 uppercase">
              <tr>
                <th className="px-4 py-3">{t("user")}</th>
                <th className="px-4 py-3">{t("type")}</th>
                <th className="px-4 py-3">{t("status")}</th>
                <th className="px-4 py-3">{t("requested")}</th>
                <th className="px-4 py-3">{t("processed")}</th>
                <th className="px-4 py-3">{t("reason")}</th>
                {canProcess ? <th className="px-4 py-3" /> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-100">
              {requests.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-sand-900">{r.user.name}</div>
                    <div className="text-xs text-sand-600">{r.user.email}</div>
                  </td>
                  <td className="px-4 py-3">{enumLabel(te, "dataRequestType", r.type)}</td>
                  <td className="px-4 py-3">
                    <Badge
                      tone={
                        r.status === "COMPLETED"
                          ? "good"
                          : r.status === "REJECTED"
                            ? "neutral"
                            : "warn"
                      }
                    >
                      {enumLabel(te, "dataRequestStatus", r.status)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">{formatIsoDate(r.createdAt)}</td>
                  <td className="px-4 py-3">
                    {r.processedAt ? formatIsoDate(r.processedAt) : "—"}
                  </td>
                  <td className="max-w-xs px-4 py-3 text-xs text-sand-700">{r.reason ?? "—"}</td>
                  {canProcess ? (
                    <td className="px-4 py-3">
                      {r.status === "REQUESTED" || r.status === "IN_PROGRESS" ? (
                        <DataRequestActions requestId={r.id} type={r.type} />
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
