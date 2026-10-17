import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";

import { Badge } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { toggleCity } from "@/features/admin/actions";
import { getSettingsPageData } from "@/features/admin/queries";
import { CityForm, SettingRow } from "@/features/admin/settings-forms";
import { DocumentTypeForm } from "@/features/admin/review-forms";
import { Link } from "@/i18n/navigation";
import { enumLabel } from "@/lib/i18n-enum";
import { requirePermission } from "@/server/auth/session";

type Props = { params: Promise<{ locale: string }> };

export default async function AdminSettingsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { access } = await requirePermission("settings.manage", "/admin/settings");
  const t = await getTranslations("admin.settings");
  const te = await getTranslations("enums");
  const currentLocale = await getLocale();
  const { cities, settings, documentTypes } = await getSettingsPageData();
  const name = (o: { nameFr: string; nameEn: string }) =>
    currentLocale === "en" ? o.nameEn : o.nameFr;
  const description = (o: { descriptionFr: string | null; descriptionEn: string | null }) =>
    (currentLocale === "en" ? o.descriptionEn : o.descriptionFr) ?? "";

  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-bold text-sand-900">{t("title")}</h1>

      <section className="rounded-xl border border-brand-200 bg-brand-50 p-5">
        <h2 className="text-lg font-semibold text-brand-800">{t("payments.title")}</h2>
        <p className="mt-1 text-sm text-sand-700">{t("payments.cardIntro")}</p>
        <Link
          href="/admin/settings/payments"
          className="mt-3 inline-block font-semibold text-brand-700 hover:underline"
        >
          {t("payments.open")} →
        </Link>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{t("cities")}</h2>
        <ul className="divide-y divide-sand-200 rounded-xl border border-sand-200 bg-white">
          {cities.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium text-sand-900">
                  {name(c)} <span className="text-sm font-normal text-sand-500">/{c.slug}</span>
                </p>
                <p className="text-sm text-sand-600">
                  {c.region ?? "—"} · {t("branches")}:{" "}
                  {c.branches.map((b) => name(b)).join(", ") || "—"}
                </p>
              </div>
              <form action={toggleCity} className="flex items-center gap-3">
                <input type="hidden" name="cityId" value={c.id} />
                <Badge tone={c.isActive ? "good" : "neutral"}>
                  {c.isActive ? t("active") : "—"}
                </Badge>
                <Button type="submit" variant="outline" size="sm">
                  {t("toggleCity")}
                </Button>
              </form>
            </li>
          ))}
        </ul>
        <CityForm />
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{t("systemSettings")}</h2>
        <div className="overflow-x-auto rounded-xl border border-sand-200 bg-white" tabIndex={0}>
          <table className="min-w-full text-sm">
            <thead className="bg-sand-100 text-left text-xs tracking-wide text-sand-600 uppercase">
              <tr>
                <th className="px-4 py-3">{t("key")}</th>
                <th className="px-4 py-3">{t("description")}</th>
                <th className="px-4 py-3">{t("value")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-200">
              {settings.map((s) => (
                <SettingRow
                  key={s.key}
                  settingKey={s.key}
                  value={s.value}
                  valueType={s.valueType}
                  description={description(s)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{t("documentTypes")}</h2>
        <div className="overflow-x-auto rounded-xl border border-sand-200 bg-white" tabIndex={0}>
          <table className="min-w-full text-sm">
            <thead className="bg-sand-100 text-left text-xs tracking-wide text-sand-600 uppercase">
              <tr>
                <th className="px-4 py-3">{t("description")}</th>
                <th className="px-4 py-3">{t("dtSubject")}</th>
                <th className="px-4 py-3">{t("mandatory")}</th>
                <th className="px-4 py-3">{t("blocksWhenExpired")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-200">
              {documentTypes.map((d) => (
                <tr key={d.id} className={d.isActive ? "" : "opacity-60"}>
                  <td className="px-4 py-3 font-medium">{name(d)}</td>
                  <td className="px-4 py-3">
                    <Badge>{enumLabel(te, "documentSubject", d.subjectType)}</Badge>
                  </td>

                  <td className="px-4 py-3">{d.isMandatory ? "✓" : "—"}</td>
                  <td className="px-4 py-3">{d.blocksVehicleWhenExpired ? "✓" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {access.permissions.has("document.configure_types") ? <DocumentTypeForm /> : null}
      </section>
    </div>
  );
}
