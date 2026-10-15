import { parseGeometry } from "@ridekmer/tracking";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";

import { Badge } from "@/components/ui/alert";
import { GeofenceForm } from "@/features/tracking/forms";
import { listGeofences } from "@/features/tracking/geofences";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db";

export default async function AdminGeofencesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePermission("tracking.manage_devices", "/admin/geofences");
  const t = await getTranslations("tracking.geofences");
  const currentLocale = await getLocale();
  const [geofences, cities] = await Promise.all([
    listGeofences(),
    db.city.findMany({
      orderBy: { sortOrder: "asc" },
      select: { id: true, nameFr: true, nameEn: true },
    }),
  ]);
  const cityOptions = cities.map((c) => ({
    id: c.id,
    name: currentLocale === "en" ? c.nameEn : c.nameFr,
  }));
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-sand-900">{t("title")}</h1>
        <Link href="/admin/fleet" className="text-sm text-brand-700 hover:underline">
          ← {t("backToFleet")}
        </Link>
      </div>
      <p className="max-w-3xl text-sm text-sand-700">{t("intro")}</p>
      <ul className="space-y-3">
        {geofences.map((g) => {
          const geometry = parseGeometry(g.geometry);
          return (
            <li key={g.id} className="rounded-xl border border-sand-200 bg-white p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">
                  {g.name}{" "}
                  <Badge tone={g.type === "RESTRICTED" ? "danger" : "brand"}>
                    {t(`types.${g.type}`)}
                  </Badge>{" "}
                  {!g.isActive ? <Badge>{t("inactive")}</Badge> : null}
                </span>
                <span className="text-xs text-sand-600">
                  {geometry?.kind === "circle"
                    ? `${t("circle")} · ${(geometry.radiusMeters / 1000).toFixed(1)} km`
                    : geometry
                      ? `${t("polygon")} · ${geometry.ring.length} ${t("vertices")}`
                      : t("invalid")}
                  {g.alertOnExit ? ` · ${t("alertOnExit")}` : ""}
                </span>
              </div>
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-brand-700">{t("edit")}</summary>
                <div className="mt-2">
                  {geometry ? (
                    <GeofenceForm
                      cities={cityOptions}
                      geofence={{
                        id: g.id,
                        name: g.name,
                        type: g.type,
                        cityId: g.cityId,
                        alertOnExit: g.alertOnExit,
                        isActive: g.isActive,
                        geometry,
                      }}
                    />
                  ) : null}
                </div>
              </details>
            </li>
          );
        })}
      </ul>
      <GeofenceForm cities={cityOptions} />
    </div>
  );
}
