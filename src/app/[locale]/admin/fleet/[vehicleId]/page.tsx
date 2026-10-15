import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { Alert, Badge } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { getVehicleTrack } from "@/features/tracking/queries";
import { StaticMap } from "@/features/tracking/static-map";
import { Link } from "@/i18n/navigation";
import { fromDoualaLocal, isoDateFromNow } from "@/lib/dates";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db";

export default async function AdminVehicleTrackPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; vehicleId: string }>;
  searchParams: Promise<{ from?: string; to?: string; reason?: string }>;
}) {
  const { locale, vehicleId } = await params;
  setRequestLocale(locale);
  const { user, access } = await requirePermission(
    "tracking.view_history",
    `/admin/fleet/${vehicleId}`,
  );
  const sp = await searchParams;
  const t = await getTranslations("tracking.history");
  const format = await getFormatter();
  const vehicle = await db.vehicle.findUnique({
    where: { id: vehicleId },
    select: { id: true, make: true, model: true, registrationNumber: true },
  });
  if (!vehicle) notFound();
  const reason = (sp.reason ?? "").trim();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? "") ? sp.from! : isoDateFromNow(-7);
  const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.to ?? "") ? sp.to! : isoDateFromNow(0);
  const track =
    reason.length >= 5
      ? await getVehicleTrack({
          vehicleId,
          from: fromDoualaLocal(`${from}T00:00`),
          to: fromDoualaLocal(`${to}T23:59`),
          viewerId: user.id,
          reason,
        })
      : null;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-sand-900">
          {vehicle.make} {vehicle.model} · {vehicle.registrationNumber}
        </h1>
        <Link href="/admin/fleet" className="text-sm text-brand-700 hover:underline">
          ← {t("backToFleet")}
        </Link>
      </div>
      <Alert tone="info">{t("reasonNotice")}</Alert>
      <form
        method="get"
        className="grid gap-3 rounded-xl border border-sand-200 bg-white p-5 sm:grid-cols-4 sm:items-end"
      >
        <Field id="from" label={t("from")}>
          <Input id="from" name="from" type="date" defaultValue={from} />
        </Field>
        <Field id="to" label={t("to")}>
          <Input id="to" name="to" type="date" defaultValue={to} />
        </Field>
        <Field id="reason" label={t("reason")} required hint={t("reasonHint")}>
          <Input
            id="reason"
            name="reason"
            defaultValue={reason}
            required
            minLength={5}
            maxLength={200}
          />
        </Field>
        <Button type="submit">{t("load")}</Button>
      </form>
      {track ? (
        <>
          <div className="flex flex-wrap gap-3 text-sm">
            <Badge>{t("fixes", { count: track.fixes.length })}</Badge>
            <Badge>{t("distance", { km: track.distanceKm })}</Badge>
            <Badge>{t("trips", { count: track.trips.length })}</Badge>
            {access.permissions.has("tracking.export") ? (
              <a
                href={`/api/admin/tracking/${vehicleId}/export?from=${from}&to=${to}&reason=${encodeURIComponent(reason)}`}
                className="text-brand-700 underline"
              >
                {t("exportCsv")}
              </a>
            ) : null}
          </div>
          <StaticMap
            title={t("mapTitle")}
            track={track.fixes.map((f) => ({ latitude: f.latitude!, longitude: f.longitude! }))}
            markers={[
              ...(track.fixes[0]
                ? [
                    {
                      id: "start",
                      latitude: track.fixes[0].latitude!,
                      longitude: track.fixes[0].longitude!,
                      label: t("start"),
                      tone: "good" as const,
                    },
                  ]
                : []),
              ...(track.fixes.length > 1
                ? [
                    {
                      id: "end",
                      latitude: track.fixes.at(-1)!.latitude!,
                      longitude: track.fixes.at(-1)!.longitude!,
                      label: t("end"),
                      tone: "brand" as const,
                    },
                  ]
                : []),
            ]}
          />
          <section>
            <h2 className="text-lg font-semibold">{t("tripsTitle")}</h2>
            <ul className="mt-2 divide-y divide-sand-200 rounded-xl border border-sand-200 bg-white text-sm">
              {track.trips.length === 0 ? (
                <li className="px-4 py-3 text-sand-600">{t("noTrips")}</li>
              ) : null}
              {track.trips.map((tr, i) => (
                <li key={i} className="flex flex-wrap justify-between gap-2 px-4 py-2">
                  <span>
                    {format.dateTime(tr.startAt, "full")} → {format.dateTime(tr.endAt, "full")}
                  </span>
                  <span>
                    {tr.distanceKm} km · {tr.points} {t("points")}
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h2 className="text-lg font-semibold">{t("events")}</h2>
            <ul className="mt-2 divide-y divide-sand-200 rounded-xl border border-sand-200 bg-white text-xs">
              {track.other.length === 0 ? (
                <li className="px-4 py-3 text-sand-600">{t("noEvents")}</li>
              ) : null}
              {track.other.map((e) => (
                <li key={e.id} className="px-4 py-2">
                  <span className="font-mono text-sand-500">
                    {format.dateTime(e.recordedAt, "full")}
                  </span>{" "}
                  · {e.type}
                  {e.geofenceId ? ` · ${e.geofenceId}` : ""}
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : (
        <p className="text-sm text-sand-600">{t("enterReason")}</p>
      )}
    </div>
  );
}
