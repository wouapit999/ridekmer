import { getFormatter, getLocale, getTranslations, setRequestLocale } from "next-intl/server";

import { Badge } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { listVehiclesForAdmin } from "@/features/admin/review-queries";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/server/auth/session";

import type { VehicleStatus } from "@/generated/prisma/enums";

const STATUSES: Array<VehicleStatus | "ALL"> = [
  "ALL",
  "SUBMITTED",
  "UNDER_REVIEW",
  "ACTIVE",
  "UNAVAILABLE_DOCUMENTS",
  "SUSPENDED",
  "REJECTED",
  "DRAFT",
  "WITHDRAWN",
];
const TONE: Record<string, "neutral" | "brand" | "warn" | "danger" | "good"> = {
  DRAFT: "neutral",
  SUBMITTED: "brand",
  UNDER_REVIEW: "brand",
  APPROVED: "good",
  ACTIVE: "good",
  SUSPENDED: "warn",
  UNAVAILABLE_DOCUMENTS: "danger",
  WITHDRAWN: "neutral",
  REJECTED: "danger",
};

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
};

export default async function AdminVehiclesPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePermission("vehicle.view_all", "/admin/vehicles");
  const sp = await searchParams;
  const t = await getTranslations("admin.vehicles");
  const ts = await getTranslations("owner.vehicles.status");
  const currentLocale = await getLocale();
  const format = await getFormatter();
  const status = (STATUSES.includes(sp.status as VehicleStatus) ? sp.status : "SUBMITTED") as
    VehicleStatus | "ALL";
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const result = await listVehiclesForAdmin({ status, q: sp.q?.trim() || undefined, page });
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-sand-900">{t("title")}</h1>
      <nav className="flex flex-wrap gap-2" aria-label="Status filter">
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={`/admin/vehicles?status=${s}`}
            aria-current={s === status ? "page" : undefined}
            className={
              s === status
                ? "rounded-full bg-brand-600 px-3 py-1 text-sm font-semibold text-white"
                : "rounded-full bg-white px-3 py-1 text-sm text-sand-700 ring-1 ring-sand-200"
            }
          >
            {s === "ALL" ? t("all") : ts(s)}{" "}
            {s !== "ALL" && result.counts[s] ? `(${result.counts[s]})` : ""}
          </Link>
        ))}
      </nav>
      <form method="get" className="flex max-w-lg gap-2" role="search">
        <input type="hidden" name="status" value={status} />
        <label htmlFor="q" className="sr-only">
          {t("search")}
        </label>
        <Input id="q" name="q" defaultValue={sp.q} placeholder={t("search")} />
        <Button type="submit" variant="outline">
          →
        </Button>
      </form>
      <div className="overflow-x-auto rounded-xl border border-sand-200 bg-white" tabIndex={0}>
        <table className="min-w-full text-sm">
          <thead className="bg-sand-100 text-left text-xs tracking-wide text-sand-600 uppercase">
            <tr>
              <th className="px-4 py-3">{t("plate")}</th>
              <th className="px-4 py-3">{t("vehicle")}</th>
              <th className="px-4 py-3">{t("owner")}</th>
              <th className="px-4 py-3">{t("city")}</th>
              <th className="px-4 py-3">{t("status")}</th>
              <th className="px-4 py-3">{t("documents")}</th>
              <th className="px-4 py-3">{t("submitted")}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-sand-200">
            {result.vehicles.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-sand-600">
                  {t("noResults")}
                </td>
              </tr>
            ) : null}
            {result.vehicles.map((v) => (
              <tr key={v.id}>
                <td className="px-4 py-3 font-mono text-xs">{v.registrationNumber}</td>
                <td className="px-4 py-3 font-medium">
                  {v.make} {v.model} {v.manufacturingYear}
                </td>
                <td className="px-4 py-3">{v.ownerProfile?.displayName ?? "RideKmer"}</td>
                <td className="px-4 py-3">
                  {currentLocale === "en" ? v.city.nameEn : v.city.nameFr}
                </td>
                <td className="px-4 py-3">
                  <Badge tone={TONE[v.status]}>{ts(v.status)}</Badge>
                </td>
                <td className="px-4 py-3">
                  {v.documents.filter((d) => d.status === "VERIFIED").length}/{v.documents.length}
                </td>
                <td className="px-4 py-3 text-sand-700">
                  {v.submittedAt ? format.dateTime(v.submittedAt, "short") : "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/admin/vehicles/${v.id}`}
                    className="font-medium text-brand-700 hover:underline"
                  >
                    {t("review")}
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
