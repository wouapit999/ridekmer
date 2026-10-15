"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";

import {
  assignDeviceAction,
  immobilisationStepAction,
  registerDeviceAction,
  requestImmobilisationAction,
  saveGeofenceAction,
  unassignDeviceAction,
  type TrackingActionResult,
} from "./actions";

const initial: TrackingActionResult = { ok: false };

function Result({ state }: { state: TrackingActionResult }) {
  const t = useTranslations("tracking.result");
  if (!state.message) return null;
  return (
    <Alert tone={state.ok ? "success" : "danger"}>
      {t.has(state.message as "INVALID") ? t(state.message as "INVALID") : state.message}
    </Alert>
  );
}

export function RegisterDeviceForm({ providerId }: { providerId: string }) {
  const t = useTranslations("tracking.devices");
  const [state, action, pending] = useActionState(registerDeviceAction, initial);
  return (
    <form
      action={action}
      className="grid gap-3 rounded-xl border border-sand-200 bg-white p-5 sm:grid-cols-3"
    >
      <h3 className="font-semibold sm:col-span-3">{t("register")}</h3>
      <p className="text-xs text-sand-600 sm:col-span-3">{t("registerHint")}</p>
      <div className="sm:col-span-3">
        <Result state={state} />
      </div>
      <Field id="dev-type" label={t("type")} required>
        <Select id="dev-type" name="type" defaultValue="COMMERCIAL_GPS">
          <option value="COMMERCIAL_GPS">{t("types.COMMERCIAL_GPS")}</option>
          <option value="SECONDARY_RECOVERY_TAG">{t("types.SECONDARY_RECOVERY_TAG")}</option>
        </Select>
      </Field>
      <Field
        id="dev-provider"
        label={t("provider")}
        hint={t("providerHint", { provider: providerId })}
        required
      >
        <Input
          id="dev-provider"
          name="provider"
          defaultValue={providerId}
          pattern="[a-z0-9-]+"
          required
        />
      </Field>
      <Field id="dev-ext" label={t("externalId")} required>
        <Input id="dev-ext" name="externalDeviceId" required minLength={2} maxLength={80} />
      </Field>
      <Field id="dev-model" label={t("model")}>
        <Input id="dev-model" name="model" maxLength={80} />
      </Field>
      <Field id="dev-serial" label={t("serial")} hint={t("encryptedHint")}>
        <Input id="dev-serial" name="serialNumber" maxLength={80} autoComplete="off" />
      </Field>
      <Field id="dev-sim" label={t("sim")} hint={t("encryptedHint")}>
        <Input id="dev-sim" name="simNumber" maxLength={40} autoComplete="off" />
      </Field>
      <div className="sm:col-span-3">
        <Button type="submit" loading={pending}>
          {t("registerButton")}
        </Button>
      </div>
    </form>
  );
}

export function AssignDeviceForm({
  deviceId,
  vehicles,
}: {
  deviceId: string;
  vehicles: Array<{ id: string; label: string; needsConsent: boolean }>;
}) {
  const t = useTranslations("tracking.devices");
  const [state, action, pending] = useActionState(assignDeviceAction, initial);
  return (
    <form
      action={action}
      className="grid gap-2 rounded-lg border border-sand-200 bg-sand-50 p-3 sm:grid-cols-4 sm:items-end"
    >
      <input type="hidden" name="deviceId" value={deviceId} />
      <div className="sm:col-span-4">
        <Result state={state} />
      </div>
      <Field id={`as-v-${deviceId}`} label={t("vehicle")} required>
        <Select id={`as-v-${deviceId}`} name="vehicleId" required>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
              {v.needsConsent ? ` (${t("consentRequiredShort")})` : ""}
            </option>
          ))}
        </Select>
      </Field>
      <Field id={`as-c-${deviceId}`} label={t("consentDate")} hint={t("consentHint")}>
        <Input id={`as-c-${deviceId}`} name="ownerConsentAt" type="date" />
      </Field>
      <Field id={`as-n-${deviceId}`} label={t("consentNotes")}>
        <Input id={`as-n-${deviceId}`} name="consentNotes" maxLength={500} />
      </Field>
      <Button type="submit" size="sm" loading={pending}>
        {t("assign")}
      </Button>
    </form>
  );
}

export function UnassignDeviceForm({ deviceId }: { deviceId: string }) {
  const t = useTranslations("tracking.devices");
  const [state, action, pending] = useActionState(unassignDeviceAction, initial);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="deviceId" value={deviceId} />
      <Result state={state} />
      <Field id={`un-r-${deviceId}`} label={t("reason")} className="min-w-40 flex-1">
        <Input id={`un-r-${deviceId}`} name="reason" maxLength={300} />
      </Field>
      <label className="flex items-center gap-2 pb-2 text-xs">
        <Checkbox name="removed" value="1" />
        {t("removed")}
      </label>
      <Button type="submit" size="sm" variant="outline" loading={pending}>
        {t("unassign")}
      </Button>
    </form>
  );
}

export function GeofenceForm({
  cities,
  geofence,
}: {
  cities: Array<{ id: string; name: string }>;
  geofence?: {
    id: string;
    name: string;
    type: string;
    cityId: string | null;
    alertOnExit: boolean;
    isActive: boolean;
    geometry:
      | { kind: "circle"; center: { latitude: number; longitude: number }; radiusMeters: number }
      | { kind: "polygon"; ring: Array<[number, number]> };
  } | null;
}) {
  const t = useTranslations("tracking.geofences");
  const [state, action, pending] = useActionState(saveGeofenceAction, initial);
  const p = geofence?.id ?? "new";
  const circle = geofence?.geometry.kind === "circle" ? geofence.geometry : null;
  const ring =
    geofence?.geometry.kind === "polygon"
      ? geofence.geometry.ring.map((r) => r.join(", ")).join("\n")
      : "";
  return (
    <form
      action={action}
      className="grid gap-3 rounded-xl border border-sand-200 bg-white p-5 sm:grid-cols-3"
    >
      <h3 className="font-semibold sm:col-span-3">{geofence ? t("edit") : t("create")}</h3>
      {geofence ? <input type="hidden" name="geofenceId" value={geofence.id} /> : null}
      <div className="sm:col-span-3">
        <Result state={state} />
      </div>
      <Field id={`gf-name-${p}`} label={t("name")} required>
        <Input
          id={`gf-name-${p}`}
          name="name"
          defaultValue={geofence?.name ?? ""}
          required
          minLength={2}
          maxLength={80}
        />
      </Field>
      <Field id={`gf-type-${p}`} label={t("type")} required>
        <Select id={`gf-type-${p}`} name="type" defaultValue={geofence?.type ?? "CUSTOM"}>
          {["CITY", "BRANCH", "CUSTOM", "RESTRICTED"].map((x) => (
            <option key={x} value={x}>
              {t(`types.${x}`)}
            </option>
          ))}
        </Select>
      </Field>
      <Field id={`gf-city-${p}`} label={t("city")}>
        <Select id={`gf-city-${p}`} name="cityId" defaultValue={geofence?.cityId ?? ""}>
          <option value="">—</option>
          {cities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field id={`gf-shape-${p}`} label={t("shape")} required>
        <Select
          id={`gf-shape-${p}`}
          name="shape"
          defaultValue={geofence?.geometry.kind ?? "circle"}
        >
          <option value="circle">{t("circle")}</option>
          <option value="polygon">{t("polygon")}</option>
        </Select>
      </Field>
      <Field id={`gf-lat-${p}`} label={t("latitude")}>
        <Input
          id={`gf-lat-${p}`}
          name="latitude"
          type="number"
          step="0.000001"
          defaultValue={circle?.center.latitude ?? ""}
        />
      </Field>
      <Field id={`gf-lng-${p}`} label={t("longitude")}>
        <Input
          id={`gf-lng-${p}`}
          name="longitude"
          type="number"
          step="0.000001"
          defaultValue={circle?.center.longitude ?? ""}
        />
      </Field>
      <Field id={`gf-r-${p}`} label={t("radiusMeters")}>
        <Input
          id={`gf-r-${p}`}
          name="radiusMeters"
          type="number"
          min={50}
          step={50}
          defaultValue={circle?.radiusMeters ?? ""}
        />
      </Field>
      <Field id={`gf-ring-${p}`} label={t("ring")} hint={t("ringHint")} className="sm:col-span-2">
        <Textarea
          id={`gf-ring-${p}`}
          name="ring"
          defaultValue={ring}
          className="min-h-16 font-mono text-xs"
        />
      </Field>
      <div className="flex flex-wrap gap-4 sm:col-span-3">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox name="alertOnExit" value="1" defaultChecked={geofence?.alertOnExit ?? true} />
          {t("alertOnExit")}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox name="isActive" value="1" defaultChecked={geofence?.isActive ?? true} />
          {t("active")}
        </label>
        <input type="hidden" name="isActive" value="0" />
      </div>
      <div className="sm:col-span-3">
        <Button type="submit" variant="outline" loading={pending}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}

export function RequestImmobilisationForm({
  vehicles,
}: {
  vehicles: Array<{ id: string; label: string }>;
}) {
  const t = useTranslations("tracking.immobilisation");
  const [state, action, pending] = useActionState(requestImmobilisationAction, initial);
  return (
    <form action={action} className="space-y-3 rounded-xl border border-danger-500/40 bg-white p-5">
      <h3 className="font-semibold">{t("request")}</h3>
      <p className="text-xs text-sand-700">{t("requestHint")}</p>
      <Result state={state} />
      <Field id="im-vehicle" label={t("vehicle")} required>
        <Select id="im-vehicle" name="vehicleId" required>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="im-reason" label={t("reason")} hint={t("reasonHint")} required>
        <Textarea
          id="im-reason"
          name="reason"
          required
          minLength={10}
          maxLength={1000}
          className="min-h-20"
        />
      </Field>
      <Button type="submit" variant="danger" loading={pending}>
        {t("requestButton")}
      </Button>
    </form>
  );
}

export function ImmobilisationStepForm({
  requestId,
  status,
  canRequest,
  canApprove,
  isRequester,
  alreadyDecided,
}: {
  requestId: string;
  status: string;
  canRequest: boolean;
  canApprove: boolean;
  isRequester: boolean;
  alreadyDecided: boolean;
}) {
  const t = useTranslations("tracking.immobilisation");
  const [state, action, pending] = useActionState(immobilisationStepAction, initial);
  const closed = ["ACKNOWLEDGED", "REJECTED", "CANCELLED", "UNAVAILABLE"].includes(status);
  if (closed) return null;
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="requestId" value={requestId} />
      <div className="w-full">
        <Result state={state} />
      </div>
      <Field id={`im-c-${requestId}`} label={t("comment")} className="min-w-40 flex-1">
        <Input id={`im-c-${requestId}`} name="comment" maxLength={300} />
      </Field>
      {status === "REQUESTED" && canRequest ? (
        <Button
          type="submit"
          name="step"
          value="stationary"
          size="sm"
          variant="outline"
          loading={pending}
        >
          {t("confirmStationary")}
        </Button>
      ) : null}
      {status === "STATIONARY_CONFIRMED" && canApprove && !isRequester && !alreadyDecided ? (
        <>
          <Button type="submit" name="step" value="approve" size="sm" loading={pending}>
            {t("approve")}
          </Button>
          <Button
            type="submit"
            name="step"
            value="reject"
            size="sm"
            variant="danger"
            loading={pending}
          >
            {t("reject")}
          </Button>
        </>
      ) : null}
      {status === "APPROVED" && canApprove ? (
        <Button
          type="submit"
          name="step"
          value="execute"
          size="sm"
          variant="danger"
          loading={pending}
        >
          {t("execute")}
        </Button>
      ) : null}
      {canRequest ? (
        <Button
          type="submit"
          name="step"
          value="cancel"
          size="sm"
          variant="ghost"
          loading={pending}
        >
          {t("cancel")}
        </Button>
      ) : null}
    </form>
  );
}
