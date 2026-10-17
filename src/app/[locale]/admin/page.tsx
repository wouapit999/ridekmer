import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Alert, Badge } from "@/components/ui/alert";
import { Stat } from "@/components/ui/card";
import { ADMIN_MODULE_GROUPS, ADMIN_MODULES, canOpenModule } from "@/features/admin/modules";
import { getDashboardCounts } from "@/features/admin/queries";
import { Link } from "@/i18n/navigation";
import { getEnv } from "@/lib/env";
import { storageStatus } from "@/server/files/service";
import { requireUser } from "@/server/auth/session";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin" });
  return { title: t("metaTitle") };
}

export default async function AdminDashboard({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { access } = await requireUser("/admin");
  const t = await getTranslations("admin.dashboard");
  const ta = await getTranslations("admin");
  const to = await getTranslations("admin.overview");
  const counts = await getDashboardCounts();
  const mfa = getEnv().AUTH_REQUIRE_STAFF_MFA;
  const storage = storageStatus();
  const tiles: Array<{ key: keyof typeof counts; tone?: "default" | "warn" | "good" }> = [
    { key: "bookingsToday" },
    { key: "activeRentals", tone: "good" },
    { key: "availableVehicles", tone: "good" },
    { key: "vehiclesAwaitingApproval", tone: "warn" },
    { key: "expiringDocuments", tone: "warn" },
    { key: "maintenanceDue", tone: "warn" },
    { key: "paymentsToReconcile", tone: "warn" },
    { key: "pendingRefunds", tone: "warn" },
    { key: "pendingPayouts", tone: "warn" },
    { key: "openIncidents", tone: "warn" },
    { key: "users" },
  ];
  const available = ADMIN_MODULES.filter((m) => canOpenModule(m, access.permissions));
  const hidden = ADMIN_MODULES.length - available.length;

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h1 className="text-2xl font-bold text-sand-900">{ta("title")}</h1>
        {!storage.ok ? (
          <Alert tone="danger" title={t("storageDownTitle")}>
            {t("storageDownBody", { provider: storage.provider })}
          </Alert>
        ) : null}
        <Alert tone={mfa ? "success" : "warning"}>
          {t("mfaNotice", { state: mfa ? t("enabled") : t("disabled") })}
        </Alert>
      </div>

      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => (
          <Stat
            key={tile.key}
            label={t(tile.key)}
            value={counts[tile.key]}
            tone={counts[tile.key] > 0 ? tile.tone : "default"}
          />
        ))}
      </dl>

      <section aria-labelledby="admin-overview" className="space-y-6">
        <div>
          <h2 id="admin-overview" className="text-xl font-semibold text-sand-900">
            {to("title")}
          </h2>
          <p className="mt-1 text-sm text-sand-700">{to("intro")}</p>
          {hidden > 0 ? (
            <p className="mt-1 text-sm text-sand-600">{to("hiddenNote", { count: hidden })}</p>
          ) : null}
        </div>
        {ADMIN_MODULE_GROUPS.map((group) => {
          const modules = available.filter((m) => m.group === group);
          if (modules.length === 0) return null;
          return (
            <div key={group} className="space-y-3">
              <h3 className="text-sm font-semibold tracking-wide text-sand-600 uppercase">
                {to(`groups.${group}`)}
              </h3>
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {modules.map((m) => (
                  <li key={m.key}>
                    <Link
                      href={m.href}
                      className="flex h-full flex-col rounded-lg border border-sand-200 bg-white p-4 shadow-card transition hover:border-brand-300 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-brand-600"
                    >
                      <span className="flex items-start justify-between gap-2">
                        <span className="font-semibold text-sand-900">
                          {to(`modules.${m.key}.title`)}
                        </span>
                        {m.pending && counts[m.pending] > 0 ? (
                          <Badge tone="brand">{counts[m.pending]}</Badge>
                        ) : null}
                      </span>
                      <span className="mt-1 text-sm text-sand-700">
                        {to(`modules.${m.key}.body`)}
                      </span>
                      <span className="mt-3 text-sm font-medium text-brand-700">
                        {to("open")} →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>
    </div>
  );
}
