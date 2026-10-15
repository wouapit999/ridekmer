"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { useRouter } from "@/i18n/navigation";

import {
  addBlockAction,
  ownerRequestAction,
  saveArrangementAction,
  saveBasicsAction,
  saveEquipmentAction,
  saveLocationAction,
  savePricingAction,
  submitVehicleAction,
  uploadImageAction,
  type VehicleActionResult,
} from "./actions";
import {
  BODY_TYPES,
  FUEL_TYPES,
  SAFETY_EQUIPMENT,
  TRANSMISSIONS,
  VEHICLE_CATEGORIES,
} from "./schemas";

const initial: VehicleActionResult = { ok: false };

function useErrorText() {
  const te = useTranslations("owner.errors");
  const tv = useTranslations("validation");
  return (code?: string) =>
    code ? (te.has(code as "NOT_FOUND") ? te(code as "NOT_FOUND") : tv("required")) : null;
}

function FormShell({
  state,
  children,
  pending,
  label,
}: {
  state: VehicleActionResult;
  children: React.ReactNode;
  pending: boolean;
  label: string;
}) {
  const t = useTranslations("owner.wizard");
  const err = useErrorText();
  return (
    <>
      {state.ok ? <Alert tone="success">{t("saved")}</Alert> : null}
      {!state.ok && state.message ? <Alert tone="danger">{err(state.message)}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
      <Button type="submit" loading={pending}>
        {label}
      </Button>
    </>
  );
}

type VehicleDraft = Record<string, unknown> & { id?: string };

function useStepNavigation(next: string) {
  const router = useRouter();
  return (state: VehicleActionResult) => {
    if (state.ok && state.vehicleId)
      router.push(`/owner/vehicles/${state.vehicleId}/edit?step=${next}`);
  };
}

export function BasicsForm({
  vehicle,
  cities,
}: {
  vehicle: VehicleDraft | null;
  cities: Array<{ id: string; name: string }>;
}) {
  const t = useTranslations("owner.wizard");
  const tc = useTranslations("cars");
  const err = useErrorText();
  const go = useStepNavigation("equipment");
  const [state, action, pending] = useActionState(
    async (prev: VehicleActionResult, fd: FormData) => {
      const r = await saveBasicsAction(prev, fd);
      go(r);
      return r;
    },
    initial,
  );
  const v = vehicle ?? {};
  const str = (k: string) => (v[k] === undefined || v[k] === null ? "" : String(v[k]));
  return (
    <form action={action} className="space-y-4">
      {vehicle?.id ? <input type="hidden" name="vehicleId" value={vehicle.id} /> : null}
      <FormShell state={state} pending={pending} label={t("saveContinue")}>
        <Field
          id="registrationNumber"
          label={t("basics.registrationNumber")}
          required
          error={err(state.errors?.registrationNumber)}
        >
          <Input
            id="registrationNumber"
            name="registrationNumber"
            defaultValue={str("registrationNumber")}
            required
          />
        </Field>
        <Field id="vin" label={t("basics.vin")}>
          <Input id="vin" name="vin" maxLength={17} autoComplete="off" />
        </Field>
        <Field id="make" label={t("basics.make")} required error={err(state.errors?.make)}>
          <Input id="make" name="make" defaultValue={str("make")} required />
        </Field>
        <Field id="model" label={t("basics.model")} required error={err(state.errors?.model)}>
          <Input id="model" name="model" defaultValue={str("model")} required />
        </Field>
        <Field id="trim" label={t("basics.trim")}>
          <Input id="trim" name="trim" defaultValue={str("trim")} />
        </Field>
        <Field
          id="manufacturingYear"
          label={t("basics.manufacturingYear")}
          required
          error={err(state.errors?.manufacturingYear)}
        >
          <Input
            id="manufacturingYear"
            name="manufacturingYear"
            type="number"
            inputMode="numeric"
            min={1990}
            max={new Date().getFullYear() + 1}
            defaultValue={str("manufacturingYear")}
            required
          />
        </Field>
        <Field id="firstRegistrationDate" label={t("basics.firstRegistrationDate")}>
          <Input id="firstRegistrationDate" name="firstRegistrationDate" type="date" />
        </Field>
        <Field id="cityId" label={t("basics.city")} required>
          <Select id="cityId" name="cityId" defaultValue={str("cityId")} required>
            {cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="category" label={t("basics.category")} required>
          <Select id="category" name="category" defaultValue={str("category") || "SEDAN"}>
            {VEHICLE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {tc(`categories.${c}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="bodyType" label={t("basics.bodyType")}>
          <Select id="bodyType" name="bodyType" defaultValue={str("bodyType") || "OTHER"}>
            {BODY_TYPES.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="colour" label={t("basics.colour")}>
          <Input id="colour" name="colour" defaultValue={str("colour")} />
        </Field>
        <Field id="transmission" label={t("basics.transmission")} required>
          <Select
            id="transmission"
            name="transmission"
            defaultValue={str("transmission") || "MANUAL"}
          >
            {TRANSMISSIONS.map((x) => (
              <option key={x} value={x}>
                {x === "MANUAL" ? tc("manual") : tc("automatic")}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="fuelType" label={t("basics.fuelType")} required>
          <Select id="fuelType" name="fuelType" defaultValue={str("fuelType") || "PETROL"}>
            {FUEL_TYPES.map((f) => (
              <option key={f} value={f}>
                {tc(`fuels.${f}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="engineCapacityCc" label={t("basics.engineCapacityCc")}>
          <Input
            id="engineCapacityCc"
            name="engineCapacityCc"
            type="number"
            inputMode="numeric"
            defaultValue={str("engineCapacityCc")}
          />
        </Field>
        <Field id="seats" label={t("basics.seats")} required error={err(state.errors?.seats)}>
          <Input
            id="seats"
            name="seats"
            type="number"
            inputMode="numeric"
            min={1}
            max={60}
            defaultValue={str("seats") || "5"}
            required
          />
        </Field>
        <Field id="doors" label={t("basics.doors")}>
          <Input
            id="doors"
            name="doors"
            type="number"
            inputMode="numeric"
            min={2}
            max={6}
            defaultValue={str("doors")}
          />
        </Field>
        <Field id="currentMileageKm" label={t("basics.currentMileageKm")} required>
          <Input
            id="currentMileageKm"
            name="currentMileageKm"
            type="number"
            inputMode="numeric"
            min={0}
            defaultValue={str("currentMileageKm") || "0"}
            required
          />
        </Field>
      </FormShell>
    </form>
  );
}

export function EquipmentForm({
  vehicle,
}: {
  vehicle: VehicleDraft & { id: string; safetyEquipment: string[] };
}) {
  const t = useTranslations("owner.wizard");
  const go = useStepNavigation("location");
  const [state, action, pending] = useActionState(
    async (prev: VehicleActionResult, fd: FormData) => {
      const r = await saveEquipmentAction(prev, fd);
      go(r);
      return r;
    },
    initial,
  );
  const flags = [
    "hasAirConditioning",
    "hasBluetooth",
    "hasUsbCharging",
    "hasReversingCamera",
  ] as const;
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="vehicleId" value={vehicle.id} />
      <FormShell state={state} pending={pending} label={t("saveContinue")}>
        <div className="space-y-2 sm:col-span-2">
          {flags.map((f) => (
            <label key={f} className="flex items-center gap-2 text-sm">
              <Checkbox name={f} defaultChecked={Boolean(vehicle[f])} /> {t(`equipment.${f}`)}
            </label>
          ))}
        </div>
        <fieldset className="sm:col-span-2">
          <legend className="text-sm font-medium text-sand-800">{t("equipment.safety")}</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {SAFETY_EQUIPMENT.map((s) => (
              <label key={s} className="flex items-center gap-2 text-sm">
                <Checkbox
                  name="safetyEquipment[]"
                  value={s}
                  defaultChecked={vehicle.safetyEquipment.includes(s)}
                />{" "}
                {t(`safety.${s}`)}
              </label>
            ))}
          </div>
        </fieldset>
        <Field id="descriptionFr" label={t("equipment.descriptionFr")} className="sm:col-span-2">
          <Textarea
            id="descriptionFr"
            name="descriptionFr"
            defaultValue={String(vehicle.descriptionFr ?? "")}
            maxLength={2000}
          />
        </Field>
        <Field id="descriptionEn" label={t("equipment.descriptionEn")} className="sm:col-span-2">
          <Textarea
            id="descriptionEn"
            name="descriptionEn"
            defaultValue={String(vehicle.descriptionEn ?? "")}
            maxLength={2000}
          />
        </Field>
        <Field
          id="existingDamageNotes"
          label={t("equipment.existingDamageNotes")}
          className="sm:col-span-2"
        >
          <Textarea
            id="existingDamageNotes"
            name="existingDamageNotes"
            defaultValue={String(vehicle.existingDamageNotes ?? "")}
            maxLength={2000}
          />
        </Field>
      </FormShell>
    </form>
  );
}

export function LocationForm({
  vehicle,
  branches,
}: {
  vehicle: VehicleDraft & { id: string };
  branches: Array<{ id: string; name: string }>;
}) {
  const t = useTranslations("owner.wizard");
  const go = useStepNavigation("pricing");
  const [state, action, pending] = useActionState(
    async (prev: VehicleActionResult, fd: FormData) => {
      const r = await saveLocationAction(prev, fd);
      go(r);
      return r;
    },
    initial,
  );
  const [delivery, setDelivery] = useState(Boolean(vehicle.deliveryAvailable));
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="vehicleId" value={vehicle.id} />
      <FormShell state={state} pending={pending} label={t("saveContinue")}>
        <Field id="branchId" label={t("location.branch")} className="sm:col-span-2">
          <Select id="branchId" name="branchId" defaultValue={String(vehicle.branchId ?? "")}>
            <option value="">{t("location.noBranch")}</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="locationLabel" label={t("location.locationLabel")} className="sm:col-span-2">
          <Input
            id="locationLabel"
            name="locationLabel"
            defaultValue={String(vehicle.locationLabel ?? "")}
          />
        </Field>
        <Field id="latitude" label={t("location.latitude")}>
          <Input
            id="latitude"
            name="latitude"
            type="number"
            step="0.000001"
            defaultValue={vehicle.latitude == null ? "" : String(vehicle.latitude)}
          />
        </Field>
        <Field id="longitude" label={t("location.longitude")}>
          <Input
            id="longitude"
            name="longitude"
            type="number"
            step="0.000001"
            defaultValue={vehicle.longitude == null ? "" : String(vehicle.longitude)}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <Checkbox
            name="deliveryAvailable"
            checked={delivery}
            onChange={(e) => setDelivery(e.target.checked)}
          />{" "}
          {t("location.deliveryAvailable")}
        </label>
        {delivery ? (
          <Field id="deliveryRadiusKm" label={t("location.deliveryRadiusKm")}>
            <Input
              id="deliveryRadiusKm"
              name="deliveryRadiusKm"
              type="number"
              inputMode="numeric"
              min={1}
              max={500}
              defaultValue={String(vehicle.deliveryRadiusKm ?? "")}
            />
          </Field>
        ) : null}
      </FormShell>
    </form>
  );
}

export function PricingForm({ vehicle }: { vehicle: VehicleDraft & { id: string } }) {
  const t = useTranslations("owner.wizard");
  const err = useErrorText();
  const go = useStepNavigation("photos");
  const [state, action, pending] = useActionState(
    async (prev: VehicleActionResult, fd: FormData) => {
      const r = await savePricingAction(prev, fd);
      go(r);
      return r;
    },
    initial,
  );
  const [chauffeur, setChauffeur] = useState(Boolean(vehicle.chauffeurAvailable));
  const num = (k: string) => (vehicle[k] == null ? "" : String(vehicle[k]));
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="vehicleId" value={vehicle.id} />
      <FormShell state={state} pending={pending} label={t("saveContinue")}>
        <p className="text-sm text-sand-600 sm:col-span-2">{t("pricing.commissionNote")}</p>
        <Field
          id="dailyPriceXaf"
          label={t("pricing.dailyPriceXaf")}
          required
          error={err(state.errors?.dailyPriceXaf)}
        >
          <Input
            id="dailyPriceXaf"
            name="dailyPriceXaf"
            type="number"
            inputMode="numeric"
            min={1000}
            step={500}
            defaultValue={Number(vehicle.dailyPriceXaf) > 0 ? num("dailyPriceXaf") : ""}
            required
          />
        </Field>
        <Field id="securityDepositXaf" label={t("pricing.securityDepositXaf")} required>
          <Input
            id="securityDepositXaf"
            name="securityDepositXaf"
            type="number"
            inputMode="numeric"
            min={0}
            step={5000}
            defaultValue={num("securityDepositXaf")}
            required
          />
        </Field>
        <Field id="weeklyPriceXaf" label={t("pricing.weeklyPriceXaf")}>
          <Input
            id="weeklyPriceXaf"
            name="weeklyPriceXaf"
            type="number"
            inputMode="numeric"
            min={1000}
            step={500}
            defaultValue={num("weeklyPriceXaf")}
          />
        </Field>
        <Field id="monthlyPriceXaf" label={t("pricing.monthlyPriceXaf")}>
          <Input
            id="monthlyPriceXaf"
            name="monthlyPriceXaf"
            type="number"
            inputMode="numeric"
            min={1000}
            step={500}
            defaultValue={num("monthlyPriceXaf")}
          />
        </Field>
        <Field id="dailyKmAllowance" label={t("pricing.dailyKmAllowance")}>
          <Input
            id="dailyKmAllowance"
            name="dailyKmAllowance"
            type="number"
            inputMode="numeric"
            min={10}
            defaultValue={num("dailyKmAllowance")}
          />
        </Field>
        <Field id="extraKmRateXaf" label={t("pricing.extraKmRateXaf")}>
          <Input
            id="extraKmRateXaf"
            name="extraKmRateXaf"
            type="number"
            inputMode="numeric"
            min={10}
            defaultValue={num("extraKmRateXaf")}
          />
        </Field>
        <Field id="minRentalDays" label={t("pricing.minRentalDays")}>
          <Input
            id="minRentalDays"
            name="minRentalDays"
            type="number"
            inputMode="numeric"
            min={1}
            max={90}
            defaultValue={num("minRentalDays") || "1"}
          />
        </Field>
        <Field
          id="maxRentalDays"
          label={t("pricing.maxRentalDays")}
          error={err(state.errors?.maxRentalDays)}
        >
          <Input
            id="maxRentalDays"
            name="maxRentalDays"
            type="number"
            inputMode="numeric"
            min={1}
            max={365}
            defaultValue={num("maxRentalDays")}
          />
        </Field>
        <div className="space-y-2 sm:col-span-2">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox name="selfDriveAllowed" defaultChecked={vehicle.selfDriveAllowed !== false} />{" "}
            {t("pricing.selfDriveAllowed")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              name="chauffeurAvailable"
              checked={chauffeur}
              onChange={(e) => setChauffeur(e.target.checked)}
            />{" "}
            {t("pricing.chauffeurAvailable")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox name="instantBooking" defaultChecked={Boolean(vehicle.instantBooking)} />{" "}
            {t("pricing.instantBooking")}
          </label>
          {state.errors?.selfDriveAllowed ? (
            <p className="text-sm text-danger-700">{err(state.errors.selfDriveAllowed)}</p>
          ) : null}
        </div>
        {chauffeur ? (
          <Field
            id="chauffeurDailyFeeXaf"
            label={t("pricing.chauffeurDailyFeeXaf")}
            required
            error={err(state.errors?.chauffeurDailyFeeXaf)}
          >
            <Input
              id="chauffeurDailyFeeXaf"
              name="chauffeurDailyFeeXaf"
              type="number"
              inputMode="numeric"
              min={1000}
              defaultValue={num("chauffeurDailyFeeXaf")}
            />
          </Field>
        ) : null}
      </FormShell>
    </form>
  );
}

export function PhotosForm({ vehicleId }: { vehicleId: string }) {
  const t = useTranslations("owner.wizard.photos");
  const [state, action, pending] = useActionState(uploadImageAction, initial);
  const err = useErrorText();
  return (
    <form
      action={action}
      className="space-y-3 rounded-xl border border-sand-200 bg-white p-5"
      encType="multipart/form-data"
    >
      <input type="hidden" name="vehicleId" value={vehicleId} />
      <p className="text-sm text-sand-700">{t("intro")}</p>
      {!state.ok && state.message ? <Alert tone="danger">{err(state.message)}</Alert> : null}
      <Field id="files" label={t("files")} required>
        <Input
          id="files"
          name="files"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          required
          capture="environment"
        />
      </Field>
      <Button type="submit" loading={pending}>
        {t("upload")}
      </Button>
    </form>
  );
}

export function ArrangementForm({
  vehicle,
}: {
  vehicle: VehicleDraft & {
    id: string;
    ownershipModel: string;
    managementConfig: Record<string, unknown> | null;
  };
}) {
  const t = useTranslations("owner.wizard.arrangement");
  const tw = useTranslations("owner.wizard");
  const go = useStepNavigation("review");
  const [state, action, pending] = useActionState(
    async (prev: VehicleActionResult, fd: FormData) => {
      const r = await saveArrangementAction(prev, fd);
      go(r);
      return r;
    },
    initial,
  );
  const [model, setModel] = useState(
    vehicle.ownershipModel === "SELF_MANAGED_MARKETPLACE_VEHICLE"
      ? "SELF_MANAGED_MARKETPLACE_VEHICLE"
      : "FULLY_MANAGED_OWNER_VEHICLE",
  );
  const cfg = vehicle.managementConfig ?? {};
  const flags = [
    "ownerApprovesBookings",
    "ownerHandlesHandover",
    "ownerHandlesInspections",
    "ownerHandlesCustomerContact",
    "ownerHandlesMaintenance",
  ] as const;
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="vehicleId" value={vehicle.id} />
      <FormShell state={state} pending={pending} label={tw("saveContinue")}>
        <fieldset className="sm:col-span-2">
          <legend className="text-sm font-medium text-sand-800">{t("ownershipModel")}</legend>
          <div className="mt-2 space-y-2">
            {(["FULLY_MANAGED_OWNER_VEHICLE", "SELF_MANAGED_MARKETPLACE_VEHICLE"] as const).map(
              (m) => (
                <label key={m} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="ownershipModel"
                    value={m}
                    checked={model === m}
                    onChange={() => setModel(m)}
                    className="h-4 w-4"
                  />{" "}
                  {t(m)}
                </label>
              ),
            )}
          </div>
        </fieldset>
        {model === "SELF_MANAGED_MARKETPLACE_VEHICLE" ? (
          <fieldset className="sm:col-span-2">
            <legend className="text-sm font-medium text-sand-800">{t("selfManagedTitle")}</legend>
            <div className="mt-2 space-y-2">
              {flags.map((f) => (
                <label key={f} className="flex items-center gap-2 text-sm">
                  <Checkbox name={f} defaultChecked={Boolean(cfg[f])} /> {t(f)}
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}
        <Field
          id="ownerApprovesExpensesAboveXaf"
          label={t("ownerApprovesExpensesAboveXaf")}
          className="sm:col-span-2"
        >
          <Input
            id="ownerApprovesExpensesAboveXaf"
            name="ownerApprovesExpensesAboveXaf"
            type="number"
            inputMode="numeric"
            min={0}
            step={5000}
            defaultValue={
              cfg.ownerApprovesExpensesAboveXaf == null
                ? ""
                : String(cfg.ownerApprovesExpensesAboveXaf)
            }
          />
        </Field>
      </FormShell>
    </form>
  );
}

export function SubmitForm({ vehicleId }: { vehicleId: string }) {
  const t = useTranslations("owner.wizard.review");
  const ti = useTranslations("owner.wizard.review.items");
  const err = useErrorText();
  const router = useRouter();
  const [state, action, pending] = useActionState(
    async (prev: VehicleActionResult, fd: FormData) => {
      const r = await submitVehicleAction(prev, fd);
      if (r.ok) router.push(`/owner/vehicles/${vehicleId}`);
      return r;
    },
    initial,
  );
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="vehicleId" value={vehicleId} />
      {state.message === "INCOMPLETE" && state.details ? (
        <Alert tone="warning" title={t("missing")}>
          <ul className="list-disc pl-5">
            {state.details.map((d) => (
              <li key={d}>
                {d.startsWith("document:")
                  ? ti("document", { type: d.slice(9) })
                  : ti.has(d as "pricing")
                    ? ti(d as "pricing")
                    : d}
              </li>
            ))}
          </ul>
        </Alert>
      ) : !state.ok && state.message ? (
        <Alert tone="danger">{err(state.message)}</Alert>
      ) : null}
      <Button type="submit" loading={pending} size="lg">
        {t("submit")}
      </Button>
    </form>
  );
}

export function OwnerRequestForm({ vehicleId }: { vehicleId: string }) {
  const t = useTranslations("owner.detail");
  const err = useErrorText();
  const [state, action, pending] = useActionState(ownerRequestAction, initial);
  return (
    <form action={action} className="space-y-3 rounded-xl border border-sand-200 bg-white p-5">
      <input type="hidden" name="vehicleId" value={vehicleId} />
      <h3 className="font-semibold">{t("requests")}</h3>
      {state.ok ? (
        <Alert tone="success">✓</Alert>
      ) : !state.ok && state.message ? (
        <Alert tone="danger">{err(state.message)}</Alert>
      ) : null}
      <Field id="requestType" label={t("requests")}>
        <Select id="requestType" name="type" defaultValue="SUSPENSION">
          <option value="SUSPENSION">{t("requestSuspension")}</option>
          <option value="WITHDRAWAL">{t("requestWithdrawal")}</option>
        </Select>
      </Field>
      <Field id="requestReason" label={t("requestReason")} required>
        <Input id="requestReason" name="reason" required minLength={5} maxLength={500} />
      </Field>
      <Button type="submit" variant="outline" loading={pending}>
        {t("requestSend")}
      </Button>
    </form>
  );
}

export function BlockDatesForm({ vehicleId }: { vehicleId: string }) {
  const t = useTranslations("owner.detail");
  const err = useErrorText();
  const [state, action, pending] = useActionState(addBlockAction, initial);
  return (
    <form
      action={action}
      className="grid gap-3 rounded-xl border border-sand-200 bg-white p-5 sm:grid-cols-3"
    >
      <input type="hidden" name="vehicleId" value={vehicleId} />
      {!state.ok && state.message ? (
        <div className="sm:col-span-3">
          <Alert tone="danger">
            {state.details?.includes("bookingConflict") ? t("bookingConflict") : err(state.message)}
          </Alert>
        </div>
      ) : null}
      <Field id="startDate" label={t("blockFrom")} required>
        <Input id="startDate" name="startDate" type="date" required />
      </Field>
      <Field
        id="endDate"
        label={t("blockTo")}
        required
        error={state.errors?.endDate ? err("dateOrder") : null}
      >
        <Input id="endDate" name="endDate" type="date" required />
      </Field>
      <Field id="blockReason" label={t("blockReason")}>
        <Input id="blockReason" name="reason" />
      </Field>
      <div className="sm:col-span-3">
        <Button type="submit" variant="outline" loading={pending}>
          {t("addBlock")}
        </Button>
      </div>
    </form>
  );
}
