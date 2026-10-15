import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Alert } from "@/components/ui/alert";
import { Stat } from "@/components/ui/card";
import { getDashboardCounts } from "@/features/admin/queries";
import { getEnv } from "@/lib/env";
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
  await requireUser("/admin");
  const t = await getTranslations("admin.dashboard");
  const counts = await getDashboardCounts();
  const mfa = getEnv().AUTH_REQUIRE_STAFF_MFA;
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
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-sand-900">
        {t("bookingsToday") && (await getTranslations("admin"))("title")}
      </h1>
      <Alert tone={mfa ? "success" : "warning"}>
        {t("mfaNotice", { state: mfa ? t("enabled") : t("disabled") })}
      </Alert>
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
    </div>
  );
}
