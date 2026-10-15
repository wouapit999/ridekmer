import { getFormatter, getLocale, getTranslations, setRequestLocale } from "next-intl/server";

import { Alert, Badge } from "@/components/ui/alert";
import { getFleetSnapshot } from "@/features/tracking/queries";
import { StaticMap } from "@/features/tracking/static-map";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/server/auth/session";
import { getTrackingProvider } from "@/server/tracking/registry";

export default async function AdminFleetPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { user, access } = await requirePermission("tracking.view_current", "/admin/fleet");
  const t = await getTranslations("tracking.fleet");
  const currentLocale = (await getLocale()) === "en" ? "en" : "fr";
  const format = await getFormatter();
  const fleet = await getFleetSnapshot(user.id);
  const snapshotTakenAt = new Date().getTime();
  let providerLabel = "—";
  try {
    const p = getTrackingProvider();
    providerLabel = `${p.id} (${p.environment})`;
  } catch {
    providerLabel = t("providerUnavailable");
  }
  const located = fleet.filter((v) => v.latitude !== null && v.longitude !== null);
  const now = fleet.reduce((max, v) => Math.max(max, v.recordedAt?.getTime() ?? 0), 0);
  const staleThreshold = Math.max(now, snapshotTakenAt) - 6 * 3600_000;
  const stale = (d: Date | null) => !d || d.getTime() < staleThreshold;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-sand-900">{t("title")}</h1>
        <div className="flex flex-wrap gap-2 text-sm">
          {access.permissions.has("tracking.manage_devices") ? (
            <Link
              href="/admin/devices"
              className="rounded-full bg-white px-3 py-1 ring-1 ring-sand-200"
            >
              {t("devices")}
            </Link>
          ) : null}
          {access.permissions.has("tracking.manage_devices") ? (
            <Link
              href="/admin/geofences"
              className="rounded-full bg-white px-3 py-1 ring-1 ring-sand-200"
            >
              {t("geofences")}
            </Link>
          ) : null}
          {access.permissions.has("immobilisation.request") ||
          access.permissions.has("immobilisation.approve") ? (
            <Link
              href="/admin/immobilisation"
              className="rounded-full bg-white px-3 py-1 ring-1 ring-sand-200"
            >
              {t("immobilisation")}
            </Link>
          ) : null}
          {access.permissions.has("audit.view") ? (
            <Link
              href="/admin/fleet/access"
              className="rounded-full bg-white px-3 py-1 ring-1 ring-sand-200"
            >
              {t("accessLog")}
            </Link>
          ) : null}
        </div>
      </div>
      <Alert tone="info">{t("privacyNotice", { provider: providerLabel })}</Alert>
      <StaticMap
        title={t("mapTitle")}
        markers={located.map((v) => ({
          id: v.vehicleId,
          latitude: v.latitude!,
          longitude: v.longitude!,
          label: v.registrationNumber,
          tone:
            v.deviceStatus === "TAMPER_ALERT"
              ? "danger"
              : stale(v.recordedAt)
                ? "warn"
                : v.activeBookingReference
                  ? "brand"
                  : "good",
        }))}
      />
      <div className="overflow-x-auto rounded-xl border border-sand-200 bg-white" tabIndex={0}>
        <table className="min-w-full text-sm">
          <thead className="bg-sand-100 text-left text-xs tracking-wide text-sand-600 uppercase">
            <tr>
              <th className="px-4 py-3">{t("vehicle")}</th>
              <th className="px-4 py-3">{t("device")}</th>
              <th className="px-4 py-3">{t("lastFix")}</th>
              <th className="px-4 py-3">{t("speed")}</th>
              <th className="px-4 py-3">{t("zones")}</th>
              <th className="px-4 py-3">{t("booking")}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-sand-200">
            {fleet.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-sand-600">
                  {t("none")}
                </td>
              </tr>
            ) : null}
            {fleet.map((v) => (
              <tr key={v.vehicleId}>
                <td className="px-4 py-3">
                  <span className="font-medium">{v.registrationNumber}</span>
                  <span className="block text-xs text-sand-600">
                    {v.make} {v.model} · {currentLocale === "en" ? v.cityName.en : v.cityName.fr}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Badge
                    tone={
                      v.deviceStatus === "ACTIVE"
                        ? "good"
                        : v.deviceStatus === "TAMPER_ALERT"
                          ? "danger"
                          : "warn"
                    }
                  >
                    {v.deviceStatus
                      ? t(`deviceStatuses.${v.deviceStatus}` as "deviceStatuses.ACTIVE")
                      : "—"}
                  </Badge>
                  {v.deviceType === "SECONDARY_RECOVERY_TAG" ? (
                    <span className="block text-xs text-sand-600">{t("recoveryTag")}</span>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-xs">
                  {v.recordedAt ? format.dateTime(v.recordedAt, "full") : t("noFix")}
                  {stale(v.recordedAt) && v.recordedAt ? (
                    <span className="block text-accent-700">{t("stale")}</span>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-xs">
                  {v.speedKmh !== null ? `${Math.round(v.speedKmh)} km/h` : "—"}
                  {v.ignitionOn !== null
                    ? ` · ${v.ignitionOn ? t("ignitionOn") : t("ignitionOff")}`
                    : ""}
                </td>
                <td className="px-4 py-3 text-xs">{v.insideGeofences.length}</td>
                <td className="px-4 py-3 font-mono text-xs">{v.activeBookingReference ?? "—"}</td>
                <td className="px-4 py-3 text-right">
                  {access.permissions.has("tracking.view_history") ? (
                    <Link
                      href={`/admin/fleet/${v.vehicleId}`}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {t("history")}
                    </Link>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
