"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { ActionForm } from "@/components/ui/action-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";

import {
  addDamageAction,
  addInspectionPhotoAction,
  customerInspectionDecisionAction,
  saveInspectionDetailsAction,
  settleDepositAction,
  submitInspectionAction,
  type InspectionActionResult,
} from "./actions";
import { DamageDiagram, type DamageMarker } from "./damage-diagram";
import { CHECK_AREAS, CHECK_STATES, DAMAGE_AREAS, DAMAGE_TYPES, type CheckGroup } from "./schemas";

const initial: InspectionActionResult = { ok: false };

function Result({ state }: { state: InspectionActionResult }) {
  const t = useTranslations("inspections.result");
  if (!state.message) return null;
  return (
    <Alert tone={state.ok ? "success" : "danger"}>
      {t.has(state.message as "SAVED") ? t(state.message as "SAVED") : state.message}
    </Alert>
  );
}

export function InspectionDetailsForm({
  inspectionId,
  defaults,
  checks,
}: {
  inspectionId: string;
  defaults: {
    mileageKm: number | null;
    fuelLevelPercent: number | null;
    windscreenCondition: string | null;
    notes: string | null;
  };
  checks: Partial<Record<CheckGroup, Record<string, string>>>;
}) {
  const t = useTranslations("inspections");
  const [state, action, pending] = useActionState(saveInspectionDetailsAction, initial);
  return (
    <ActionForm
      action={action}
      state={state}
      className="space-y-4 rounded-xl border border-sand-200 bg-white p-5"
    >
      <h2 className="text-lg font-semibold">{t("details")}</h2>
      <input type="hidden" name="inspectionId" value={inspectionId} />
      <Result state={state} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          id="mileageKm"
          label={t("mileageKm")}
          required
          error={state.errors?.mileageKm ? t("invalidValue") : null}
        >
          <Input
            id="mileageKm"
            name="mileageKm"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            defaultValue={defaults.mileageKm ?? ""}
            required
          />
        </Field>
        <Field id="fuelLevelPercent" label={t("fuelLevelPercent")} required>
          <Input
            id="fuelLevelPercent"
            name="fuelLevelPercent"
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            step={5}
            defaultValue={defaults.fuelLevelPercent ?? ""}
            required
          />
        </Field>
      </div>
      {(Object.keys(CHECK_AREAS) as CheckGroup[]).map((group) => (
        <fieldset key={group} className="space-y-2">
          <legend className="text-sm font-semibold">{t(`groups.${group}`)}</legend>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {CHECK_AREAS[group].map((area) => (
              <label
                key={area}
                className="flex items-center justify-between gap-2 rounded-md border border-sand-200 px-3 py-2 text-sm"
              >
                <span>{t(`areas.${area}`)}</span>
                <select
                  name={`check:${group}:${area}`}
                  defaultValue={checks[group]?.[area] ?? "ok"}
                  className="rounded border border-sand-300 px-2 py-1 text-sm"
                >
                  {CHECK_STATES.map((s) => (
                    <option key={s} value={s}>
                      {t(`states.${s}`)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <Field id="windscreenCondition" label={t("windscreen")}>
        <Select
          id="windscreenCondition"
          name="windscreenCondition"
          defaultValue={defaults.windscreenCondition ?? "ok"}
        >
          {CHECK_STATES.map((s) => (
            <option key={s} value={s}>
              {t(`states.${s}`)}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="accessories" label={t("accessories")}>
          <Input id="accessories" name="accessories" placeholder={t("accessoriesHint")} />
        </Field>
        <Field id="documentsPresent" label={t("documentsPresent")}>
          <Input id="documentsPresent" name="documentsPresent" placeholder={t("documentsHint")} />
        </Field>
      </div>
      <Field id="notes" label={t("notes")}>
        <Textarea
          id="notes"
          name="notes"
          defaultValue={defaults.notes ?? ""}
          className="min-h-20"
          maxLength={2000}
        />
      </Field>
      <Button type="submit" loading={pending}>
        {t("saveDetails")}
      </Button>
    </ActionForm>
  );
}

export function InspectionPhotoForm({
  inspectionId,
  count,
  required,
}: {
  inspectionId: string;
  count: number;
  required: number;
}) {
  const t = useTranslations("inspections");
  const [state, action, pending] = useActionState(addInspectionPhotoAction, initial);
  return (
    <ActionForm
      action={action}
      state={state}
      encType="multipart/form-data"
      className="space-y-3 rounded-xl border border-sand-200 bg-white p-5"
    >
      <h2 className="text-lg font-semibold">{t("photos", { count, required })}</h2>
      <p className="text-xs text-sand-600">{t("photosHint")}</p>
      <input type="hidden" name="inspectionId" value={inspectionId} />
      <Result state={state} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="photo-area" label={t("photoArea")}>
          <Select id="photo-area" name="area">
            {["front", "rear", "left", "right", "interior", "dashboard", "damage", "other"].map(
              (a) => (
                <option key={a} value={a}>
                  {t(`photoAreas.${a}`)}
                </option>
              ),
            )}
          </Select>
        </Field>
        <Field id="photos" label={t("photoFiles")} required>
          <Input
            id="photos"
            name="photos"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            multiple
            required
          />
        </Field>
      </div>
      <Button type="submit" variant="outline" loading={pending}>
        {t("addPhotos")}
      </Button>
    </ActionForm>
  );
}

export function DamageForm({
  inspectionId,
  markers,
  isPickup,
}: {
  inspectionId: string;
  markers: DamageMarker[];
  isPickup: boolean;
}) {
  const t = useTranslations("inspections");
  const [state, action, pending] = useActionState(addDamageAction, initial);
  return (
    <ActionForm
      action={action}
      state={state}
      className="space-y-3 rounded-xl border border-sand-200 bg-white p-5"
    >
      <h2 className="text-lg font-semibold">{t("addDamage")}</h2>
      <p className="text-xs text-sand-600">{t("damageHint")}</p>
      <input type="hidden" name="inspectionId" value={inspectionId} />
      <input type="hidden" name="diagramView" value="top" />
      <Result state={state} />
      <DamageDiagram markers={markers} interactive label={t("diagramLabel")} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="dmg-area" label={t("damageArea")} required>
          <Select id="dmg-area" name="area" required>
            {DAMAGE_AREAS.map((a) => (
              <option key={a} value={a}>
                {t(`damageAreas.${a}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="dmg-type" label={t("damageType")} required>
          <Select id="dmg-type" name="damageType" required>
            {DAMAGE_TYPES.map((d) => (
              <option key={d} value={d}>
                {t(`damageTypes.${d}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="dmg-severity" label={t("severity")} required>
          <Select id="dmg-severity" name="severity" required>
            <option value="MINOR">{t("severities.MINOR")}</option>
            <option value="MODERATE">{t("severities.MODERATE")}</option>
            <option value="SEVERE">{t("severities.SEVERE")}</option>
          </Select>
        </Field>
        <Field
          id="dmg-estimate"
          label={t("estimateXaf")}
          hint={isPickup ? t("estimatePickupHint") : t("estimateHint")}
        >
          <Input
            id="dmg-estimate"
            name="estimateXaf"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
          />
        </Field>
      </div>
      <Field id="dmg-desc" label={t("description")}>
        <Input id="dmg-desc" name="description" maxLength={500} />
      </Field>
      {!isPickup ? (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox name="isPreExisting" value="1" />
          {t("preExisting")}
        </label>
      ) : null}
      <Button type="submit" variant="outline" loading={pending}>
        {t("addDamageButton")}
      </Button>
    </ActionForm>
  );
}

export function SubmitInspectionForm({
  inspectionId,
  ready,
}: {
  inspectionId: string;
  ready: boolean;
}) {
  const t = useTranslations("inspections");
  const [state, action, pending] = useActionState(submitInspectionAction, initial);
  return (
    <ActionForm
      action={action}
      state={state}
      className="space-y-3 rounded-xl border border-brand-200 bg-brand-50 p-5"
    >
      <h2 className="text-lg font-semibold">{t("submit")}</h2>
      <p className="text-sm text-sand-700">{t("submitHint")}</p>
      <input type="hidden" name="inspectionId" value={inspectionId} />
      <Result state={state} />
      <Button type="submit" loading={pending} disabled={!ready} size="lg">
        {t("submitButton")}
      </Button>
    </ActionForm>
  );
}

export function CustomerInspectionDecision({ inspectionId }: { inspectionId: string }) {
  const t = useTranslations("inspections.customer");
  const [state, action, pending] = useActionState(customerInspectionDecisionAction, initial);
  if (state.ok)
    return (
      <Alert tone="success">
        {state.message === "DISPUTED" ? t("disputed") : t("acknowledged")}
      </Alert>
    );
  return (
    <ActionForm
      action={action}
      state={state}
      className="space-y-3 rounded-xl border border-sand-200 bg-white p-5"
    >
      <h2 className="font-semibold">{t("title")}</h2>
      <p className="text-sm text-sand-700">{t("hint")}</p>
      <input type="hidden" name="inspectionId" value={inspectionId} />
      <Result state={state} />
      <Field id="dispute-note" label={t("note")}>
        <Textarea id="dispute-note" name="note" className="min-h-16" maxLength={1000} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="decision" value="ACKNOWLEDGE" loading={pending}>
          {t("acknowledge")}
        </Button>
        <Button type="submit" name="decision" value="DISPUTE" variant="danger" loading={pending}>
          {t("dispute")}
        </Button>
      </div>
    </ActionForm>
  );
}

export function SettleDepositForm({
  bookingId,
  refundXaf,
  chargeXaf,
}: {
  bookingId: string;
  refundXaf: string;
  chargeXaf: string | null;
}) {
  const t = useTranslations("inspections.settlement");
  const [state, action, pending] = useActionState(settleDepositAction, initial);
  return (
    <ActionForm
      action={action}
      state={state}
      className="space-y-2 rounded-xl border border-sand-200 bg-white p-5"
    >
      <h2 className="font-semibold">{t("title")}</h2>
      <p className="text-sm text-sand-700">
        {t("summary", { refund: refundXaf })}
        {chargeXaf ? ` ${t("charge", { amount: chargeXaf })}` : ""}
      </p>
      <p className="text-xs text-sand-600">{t("hint")}</p>
      <input type="hidden" name="bookingId" value={bookingId} />
      <Result state={state} />
      {!state.ok ? (
        <Button type="submit" loading={pending}>
          {t("button")}
        </Button>
      ) : null}
    </ActionForm>
  );
}
