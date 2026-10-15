import { getTranslations, setRequestLocale } from "next-intl/server";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { REPORT_KEYS } from "@/features/finance/queries";
import { isoDateFromNow } from "@/lib/dates";
import { requirePermission } from "@/server/auth/session";

export default async function AdminReportsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { access } = await requirePermission("report.view", "/admin/reports");
  const t = await getTranslations("finance.reports");
  const today = isoDateFromNow(0);
  const monthAgo = isoDateFromNow(-31);
  const canExport = access.permissions.has("report.export");
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-sand-900">{t("title")}</h1>
      <p className="max-w-3xl text-sm text-sand-700">{t("intro")}</p>
      {!canExport ? <Alert tone="info">{t("noExport")}</Alert> : null}
      <form
        method="get"
        action={`/api/admin/reports/${REPORT_KEYS[0]}`}
        className="grid max-w-2xl gap-3 rounded-xl border border-sand-200 bg-white p-5 sm:grid-cols-4 sm:items-end"
        id="report-form"
      >
        <div className="text-xs text-sand-600 sm:col-span-4">{t("hint")}</div>
        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block font-medium text-sand-800">{t("report")}</span>
          <Select
            name="report"
            defaultValue={REPORT_KEYS[0]}
            onChange={undefined}
            form="report-form"
          >
            {REPORT_KEYS.map((k) => (
              <option key={k} value={k}>
                {t(`keys.${k}`)}
              </option>
            ))}
          </Select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-sand-800">{t("from")}</span>
          <Input name="from" type="date" defaultValue={monthAgo} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-sand-800">{t("to")}</span>
          <Input name="to" type="date" defaultValue={today} />
        </label>
        <div className="flex flex-wrap gap-2 sm:col-span-4">
          {REPORT_KEYS.map((k) => (
            <Button
              key={k}
              type="submit"
              formAction={`/api/admin/reports/${k}`}
              variant="outline"
              size="sm"
              disabled={!canExport}
            >
              {t("download", { report: t(`keys.${k}`) })}
            </Button>
          ))}
        </div>
      </form>
    </div>
  );
}
