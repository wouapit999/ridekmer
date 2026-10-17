import { getFormatter, getLocale, getTranslations, setRequestLocale } from "next-intl/server";

import { Badge } from "@/components/ui/alert";
import { PublishTemplateForm } from "@/features/contracts/forms";
import {
  listGeneratedContractsForAdmin,
  listTemplatesForAdmin,
} from "@/features/contracts/service";
import { Link } from "@/i18n/navigation";
import { enumLabel } from "@/lib/i18n-enum";
import { requirePermission } from "@/server/auth/session";

export default async function AdminContractsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { access } = await requirePermission("contract.view_all", "/admin/contracts");
  const sp = await searchParams;
  const t = await getTranslations("contracts.admin");
  const te = await getTranslations("enums");
  const tc = await getTranslations("contracts");
  const currentLocale = await getLocale();
  const format = await getFormatter();
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const [templates, generated] = await Promise.all([
    listTemplatesForAdmin(),
    listGeneratedContractsForAdmin(page),
  ]);
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-sand-900">{t("title")}</h1>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("templates")}</h2>
        <ul className="space-y-2">
          {templates.map((tpl) => (
            <li key={tpl.id} className="rounded-xl border border-sand-200 bg-white p-4 text-sm">
              <p className="font-semibold">
                {currentLocale === "en" ? tpl.nameEn : tpl.nameFr}{" "}
                <Badge>{enumLabel(te, "contractType", tpl.type)}</Badge>
              </p>
              <ul className="mt-1 text-xs text-sand-600">
                {tpl.versions.map((v) => (
                  <li key={v.id}>
                    v{v.version} · {v.locale} ·{" "}
                    {v.publishedAt ? format.dateTime(v.publishedAt, "short") : t("draft")} ·{" "}
                    {v.author?.name ?? t("seedAuthor")} ·{" "}
                    <code className="font-mono">{v.checksumSha256.slice(0, 12)}…</code>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
        {access.permissions.has("contract.manage") ? (
          <PublishTemplateForm
            templates={templates.map((tpl) => ({
              key: tpl.key,
              name: currentLocale === "en" ? tpl.nameEn : tpl.nameFr,
            }))}
          />
        ) : null}
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          {t("generated")} ({generated.total})
        </h2>
        <div className="overflow-x-auto rounded-xl border border-sand-200 bg-white" tabIndex={0}>
          <table className="min-w-full text-sm">
            <thead className="bg-sand-100 text-left text-xs tracking-wide text-sand-600 uppercase">
              <tr>
                <th className="px-4 py-3">{t("date")}</th>
                <th className="px-4 py-3">{t("type")}</th>
                <th className="px-4 py-3">{t("booking")}</th>
                <th className="px-4 py-3">{t("signatory")}</th>
                <th className="px-4 py-3">{t("status")}</th>
                <th className="px-4 py-3">{t("checksum")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-200">
              {generated.contracts.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-3 text-xs text-sand-600">
                    {format.dateTime(c.createdAt, "full")}
                  </td>
                  <td className="px-4 py-3 text-xs">{enumLabel(te, "contractType", c.type)}</td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {c.booking ? (
                      <Link
                        href={`/admin/bookings/${c.booking.id}`}
                        className="text-brand-700 hover:underline"
                      >
                        {c.booking.reference}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">{c.signatory?.name ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Badge
                      tone={
                        c.status === "ACCEPTED"
                          ? "good"
                          : c.status === "SUPERSEDED" || c.status === "VOID"
                            ? "neutral"
                            : "warn"
                      }
                    >
                      {enumLabel(tc, "statuses", c.status)}
                    </Badge>
                    {c.signatures[0] ? (
                      <span className="block text-xs text-sand-600">
                        {enumLabel(te, "signatureMethod", c.signatures[0].method)} ·{" "}
                        {format.dateTime(c.signatures[0].acceptedAt, "short")}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{c.checksumSha256.slice(0, 12)}…</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
