import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";

import { Badge } from "@/components/ui/alert";
import { enumLabel } from "@/lib/i18n-enum";
import { listVerificationCases } from "@/features/admin/review-queries";
import { Link } from "@/i18n/navigation";
import { requireUser, requireStaffMfa } from "@/server/auth/session";
import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";

const STATUSES = ["SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED", "ALL"] as const;

export default async function AdminVerificationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { user, access } = await requireUser("/admin/verifications");
  await requireStaffMfa(user, access);
  if (!access.permissions.has("customer.verify") && !access.permissions.has("owner.verify"))
    redirect({ href: "/account?forbidden=1", locale: await getLocale() });
  const { status: requested } = await searchParams;
  const status = STATUSES.includes(requested as (typeof STATUSES)[number])
    ? (requested as (typeof STATUSES)[number])
    : "SUBMITTED";
  const t = await getTranslations("admin.verifications");
  const tcase = await getTranslations("account.documents");
  const format = await getFormatter();
  const cases = await listVerificationCases(status);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-sand-900">{t("title")}</h1>
      <nav className="flex flex-wrap gap-2" aria-label="Status filter">
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={`/admin/verifications?status=${s}`}
            aria-current={s === status ? "page" : undefined}
            className={
              s === status
                ? "rounded-full bg-brand-600 px-3 py-1 text-sm font-semibold text-white"
                : "rounded-full bg-white px-3 py-1 text-sm text-sand-700 ring-1 ring-sand-200"
            }
          >
            {s === "ALL" ? t("allStatuses") : enumLabel(tcase, "caseStatus", s)}
          </Link>
        ))}
      </nav>
      <div className="overflow-x-auto rounded-xl border border-sand-200 bg-white" tabIndex={0}>
        <table className="min-w-full text-sm">
          <thead className="bg-sand-100 text-left text-xs tracking-wide text-sand-600 uppercase">
            <tr>
              <th className="px-4 py-3">{t("subject")}</th>
              <th className="px-4 py-3">{t("typeColumn")}</th>

              <th className="px-4 py-3">{t("submitted")}</th>
              <th className="px-4 py-3">{t("documents")}</th>
              <th className="px-4 py-3">{t("status")}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-sand-200">
            {cases.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sand-600">
                  {t("empty")}
                </td>
              </tr>
            ) : null}
            {cases.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-3 font-medium">
                  {c.customerProfile?.user.name ??
                    c.ownerProfile?.company?.legalName ??
                    c.ownerProfile?.displayName ??
                    "—"}
                </td>
                <td className="px-4 py-3">{t(`type.${c.type}`)}</td>
                <td className="px-4 py-3 text-sand-700">
                  {c.submittedAt ? format.dateTime(c.submittedAt, "short") : "—"}
                </td>
                <td className="px-4 py-3">
                  {c.documents.filter((d) => d.status === "VERIFIED").length}/{c.documents.length}
                </td>
                <td className="px-4 py-3">
                  <Badge
                    tone={
                      c.status === "APPROVED"
                        ? "good"
                        : c.status === "REJECTED"
                          ? "danger"
                          : "brand"
                    }
                  >
                    {enumLabel(tcase, "caseStatus", c.status)}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/admin/verifications/${c.id}`}
                    className="font-medium text-brand-700 hover:underline"
                  >
                    →
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
