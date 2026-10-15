import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";

import { Badge } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { listUsers } from "@/features/admin/queries";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/server/auth/session";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; page?: string }>;
};

export default async function AdminUsersPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePermission("user.view_all", "/admin/users");
  const { q, page } = await searchParams;
  const t = await getTranslations("admin.users");
  const currentLocale = await getLocale();
  const pageNumber = Math.max(1, Number(page ?? 1) || 1);
  const result = await listUsers(q?.trim() || undefined, pageNumber);
  const fmt = new Intl.DateTimeFormat(currentLocale === "en" ? "en-CM" : "fr-CM", {
    dateStyle: "medium",
    timeZone: "Africa/Douala",
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-sand-900">{t("title")}</h1>
      <form method="get" className="flex max-w-lg gap-2" role="search">
        <label htmlFor="q" className="sr-only">
          {t("search")}
        </label>
        <Input id="q" name="q" defaultValue={q} placeholder={t("search")} />
        <Button type="submit" variant="outline">
          →
        </Button>
      </form>
      <div className="overflow-x-auto rounded-xl border border-sand-200 bg-white" tabIndex={0}>
        <table className="min-w-full text-sm">
          <thead className="bg-sand-100 text-left text-xs tracking-wide text-sand-600 uppercase">
            <tr>
              <th className="px-4 py-3">{t("name")}</th>
              <th className="px-4 py-3">{t("email")}</th>
              <th className="px-4 py-3">{t("roles")}</th>
              <th className="px-4 py-3">{t("status")}</th>
              <th className="px-4 py-3">{t("mfa")}</th>
              <th className="px-4 py-3">{t("created")}</th>
              <th className="px-4 py-3">
                <span className="sr-only">{t("manage")}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-sand-200">
            {result.users.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-sand-600">
                  {t("noResults")}
                </td>
              </tr>
            ) : null}
            {result.users.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-3 font-medium text-sand-900">{u.name}</td>
                <td className="px-4 py-3 text-sand-700">{u.email}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {u.userRoles.map((ur) => (
                      <Badge key={ur.role.key} tone={ur.role.isStaff ? "brand" : "neutral"}>
                        {ur.role.key}
                      </Badge>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Badge tone={u.status === "ACTIVE" ? "good" : "danger"}>{u.status}</Badge>
                </td>
                <td className="px-4 py-3">{u.twoFactorEnabled ? "✓" : "—"}</td>
                <td className="px-4 py-3 text-sand-700">{fmt.format(u.createdAt)}</td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/admin/users/${u.id}`}
                    className="font-medium text-brand-700 hover:underline"
                  >
                    {t("manage")}
                  </Link>
                </td>
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
              href={`/admin/users?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) })}`}
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
