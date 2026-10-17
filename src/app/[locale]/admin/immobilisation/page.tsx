import { getFormatter, getLocale, getTranslations, setRequestLocale } from "next-intl/server";

import { Alert, Badge } from "@/components/ui/alert";
import { ImmobilisationStepForm, RequestImmobilisationForm } from "@/features/tracking/forms";
import { listImmobilisationRequests } from "@/features/tracking/immobilisation";
import { Link, redirect } from "@/i18n/navigation";
import { enumLabel } from "@/lib/i18n-enum";

import { requireStaffMfa, requireUser } from "@/server/auth/session";
import { db } from "@/server/db";

export default async function AdminImmobilisationPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { user, access } = await requireUser("/admin/immobilisation");
  await requireStaffMfa(user, access);
  const canRequest = access.permissions.has("immobilisation.request");
  const canApprove = access.permissions.has("immobilisation.approve");
  if (!canRequest && !canApprove)
    redirect({ href: "/account?forbidden=1", locale: await getLocale() });
  const sp = await searchParams;
  const t = await getTranslations("tracking.immobilisation");
  const te = await getTranslations("enums");
  const format = await getFormatter();
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const [result, vehicles] = await Promise.all([
    listImmobilisationRequests({ status: "ALL", page }),
    db.vehicle.findMany({
      where: { deletedAt: null, trackerAssignments: { some: { unassignedAt: null } } },
      select: { id: true, make: true, model: true, registrationNumber: true },
      orderBy: { registrationNumber: "asc" },
    }),
  ]);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-sand-900">{t("title")}</h1>
        <Link href="/admin/fleet" className="text-sm text-brand-700 hover:underline">
          ← {t("backToFleet")}
        </Link>
      </div>
      <Alert tone="warning" title={t("policyTitle")}>
        {t("policyBody")}
      </Alert>
      <ul className="space-y-3">
        {result.requests.length === 0 ? (
          <li className="text-sm text-sand-600">{t("none")}</li>
        ) : null}
        {result.requests.map((r) => {
          const approvals = result.approvals.filter((a) => a.subjectId === r.id);
          return (
            <li
              key={r.id}
              className="space-y-2 rounded-xl border border-sand-200 bg-white p-4 text-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">
                  {r.vehicle.registrationNumber} · {r.vehicle.make} {r.vehicle.model}
                </span>
                <Badge
                  tone={
                    r.status === "ACKNOWLEDGED"
                      ? "good"
                      : ["REJECTED", "CANCELLED", "UNAVAILABLE"].includes(r.status)
                        ? "neutral"
                        : "warn"
                  }
                >
                  {t(`statuses.${r.status}`)}
                </Badge>
              </div>
              <p className="text-xs text-sand-600">
                {t("requestedBy")}: {r.requestedBy.name} · {format.dateTime(r.createdAt, "full")}
                {r.stationaryConfirmedAt
                  ? ` · ${t("stationaryAt", { date: format.dateTime(r.stationaryConfirmedAt, "full") })}`
                  : ""}
                {r.providerMessage ? ` · ${r.providerMessage}` : ""}
              </p>
              <p className="whitespace-pre-line">{r.reason}</p>
              {approvals.length > 0 ? (
                <p className="text-xs text-sand-600">
                  {approvals
                    .map(
                      (a) => `${a.approver.name}: ${enumLabel(te, "approvalDecision", a.decision)}`,
                    )
                    .join(" · ")}
                </p>
              ) : null}
              <ImmobilisationStepForm
                requestId={r.id}
                status={r.status}
                canRequest={canRequest}
                canApprove={canApprove}
                isRequester={r.requestedById === user.id}
                alreadyDecided={approvals.some((a) => a.approverId === user.id)}
              />
            </li>
          );
        })}
      </ul>
      {canRequest ? (
        <RequestImmobilisationForm
          vehicles={vehicles.map((v) => ({
            id: v.id,
            label: `${v.registrationNumber} · ${v.make} ${v.model}`,
          }))}
        />
      ) : null}
    </div>
  );
}
