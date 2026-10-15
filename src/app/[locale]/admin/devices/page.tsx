import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";

import { Badge } from "@/components/ui/alert";
import { listDevices } from "@/features/tracking/devices";
import {
  AssignDeviceForm,
  RegisterDeviceForm,
  UnassignDeviceForm,
} from "@/features/tracking/forms";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db";
import { getTrackingProvider } from "@/server/tracking/registry";

export default async function AdminDevicesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePermission("tracking.manage_devices", "/admin/devices");
  const t = await getTranslations("tracking.devices");
  const format = await getFormatter();
  const [devices, vehicles] = await Promise.all([
    listDevices(),
    db.vehicle.findMany({
      where: {
        deletedAt: null,
        status: { in: ["APPROVED", "ACTIVE", "SUSPENDED", "UNAVAILABLE_DOCUMENTS"] },
      },
      select: { id: true, make: true, model: true, registrationNumber: true, ownershipModel: true },
      orderBy: { registrationNumber: "asc" },
    }),
  ]);
  let providerId = "generic-rest";
  try {
    providerId = getTrackingProvider().id;
  } catch {
    // keep the default label when the provider is not configured
  }
  const assignedVehicleIds = new Set(devices.flatMap((d) => d.assignments.map((a) => a.vehicleId)));
  const options = vehicles
    .filter((v) => !assignedVehicleIds.has(v.id))
    .map((v) => ({
      id: v.id,
      label: `${v.registrationNumber} · ${v.make} ${v.model}`,
      needsConsent: v.ownershipModel !== "RIDEKMER_OWNED",
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
        {devices.length === 0 ? <li className="text-sm text-sand-600">{t("none")}</li> : null}
        {devices.map((d) => (
          <li
            key={d.id}
            className="space-y-2 rounded-xl border border-sand-200 bg-white p-4 text-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">
                {t(`types.${d.type}`)} ·{" "}
                <code className="font-mono text-xs">{d.externalDeviceId}</code> · {d.provider}
                {d.model ? ` · ${d.model}` : ""}
              </span>
              <Badge
                tone={
                  d.status === "ACTIVE"
                    ? "good"
                    : d.status === "TAMPER_ALERT"
                      ? "danger"
                      : d.status === "REMOVED"
                        ? "neutral"
                        : "warn"
                }
              >
                {t(`statuses.${d.status}`)}
              </Badge>
            </div>
            <p className="text-xs text-sand-600">
              {d.lastSeenAt
                ? `${t("lastSeen")}: ${format.dateTime(d.lastSeenAt, "full")}`
                : t("neverSeen")}
              {d.batteryPercent !== null ? ` · ${d.batteryPercent} %` : ""}
              {d.powerStatus ? ` · ${d.powerStatus}` : ""} · {t("registeredBy")}:{" "}
              {d.registeredBy?.name ?? "—"}
            </p>
            {d.assignments[0] ? (
              <div className="space-y-2">
                <p className="text-sm">
                  {t("assignedTo")}:{" "}
                  <Link
                    href={`/admin/vehicles/${d.assignments[0].vehicle.id}`}
                    className="text-brand-700 hover:underline"
                  >
                    {d.assignments[0].vehicle.registrationNumber} · {d.assignments[0].vehicle.make}{" "}
                    {d.assignments[0].vehicle.model}
                  </Link>
                  {d.assignments[0].ownerConsentAt ? (
                    <span className="block text-xs text-success-600">
                      {t("consentOn", {
                        date: format.dateTime(d.assignments[0].ownerConsentAt, "short"),
                      })}
                    </span>
                  ) : d.assignments[0].vehicle.ownershipModel !== "RIDEKMER_OWNED" ? (
                    <span className="block text-xs text-danger-700">{t("consentMissing")}</span>
                  ) : null}
                </p>
                <UnassignDeviceForm deviceId={d.id} />
              </div>
            ) : d.status !== "REMOVED" ? (
              <AssignDeviceForm deviceId={d.id} vehicles={options} />
            ) : null}
          </li>
        ))}
      </ul>
      <RegisterDeviceForm providerId={providerId} />
    </div>
  );
}
