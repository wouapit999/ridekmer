"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";

import {
  createRecordAction,
  ownerDecideMaintenanceAction,
  saveScheduleAction,
  transitionRecordAction,
  type MaintenanceActionResult,
} from "./actions";
import { MAINTENANCE_TRANSITIONS } from "./state-machine";

import type { MaintenanceStatus } from "@/generated/prisma/enums";

const initial: MaintenanceActionResult = { ok: false };
const TYPES = [
  "OIL_CHANGE",
  "TYRE_CHANGE",
  "BRAKES",
  "INSURANCE_RENEWAL",
  "TECHNICAL_INSPECTION",
  "REPAIR",
  "PERIODIC_SERVICE",
  "OTHER",
] as const;

function Result({ state }: { state: MaintenanceActionResult }) {
  const t = useTranslations("maintenance.result");
  if (!state.message) return null;
  return (
    <Alert tone={state.ok ? "success" : "danger"}>
      {t.has(state.message as "INVALID") ? t(state.message as "INVALID") : state.message}
    </Alert>
  );
}

export function ScheduleForm({
  vehicleId,
  schedule,
}: {
  vehicleId: string;
  schedule?: {
    id: string;
    type: string;
    intervalDays: number | null;
    intervalKm: number | null;
    nextDueDate: string | null;
    nextDueKm: number | null;
    reminderDaysBefore: number;
    reminderKmBefore: number;
  } | null;
}) {
  const t = useTranslations("maintenance");
  const [state, action, pending] = useActionState(saveScheduleAction, initial);
  const p = schedule?.id ?? "new";
  return (
    <form
      action={action}
      className="grid gap-3 rounded-xl border border-sand-200 bg-white p-5 sm:grid-cols-3"
    >
      <h3 className="font-semibold sm:col-span-3">
        {schedule ? t("editSchedule") : t("addSchedule")}
      </h3>
      <input type="hidden" name="vehicleId" value={vehicleId} />
      {schedule ? <input type="hidden" name="scheduleId" value={schedule.id} /> : null}
      <div className="sm:col-span-3">
        <Result state={state} />
      </div>
      <Field id={`sch-type-${p}`} label={t("type")} required>
        <Select
          id={`sch-type-${p}`}
          name="type"
          defaultValue={schedule?.type ?? "PERIODIC_SERVICE"}
        >
          {TYPES.map((x) => (
            <option key={x} value={x}>
              {t(`types.${x}`)}
            </option>
          ))}
        </Select>
      </Field>
      <Field id={`sch-idays-${p}`} label={t("intervalDays")}>
        <Input
          id={`sch-idays-${p}`}
          name="intervalDays"
          type="number"
          min={0}
          defaultValue={schedule?.intervalDays ?? ""}
        />
      </Field>
      <Field id={`sch-ikm-${p}`} label={t("intervalKm")}>
        <Input
          id={`sch-ikm-${p}`}
          name="intervalKm"
          type="number"
          min={0}
          defaultValue={schedule?.intervalKm ?? ""}
        />
      </Field>
      <Field id={`sch-ndate-${p}`} label={t("nextDueDate")}>
        <Input
          id={`sch-ndate-${p}`}
          name="nextDueDate"
          type="date"
          defaultValue={schedule?.nextDueDate ?? ""}
        />
      </Field>
      <Field id={`sch-nkm-${p}`} label={t("nextDueKm")}>
        <Input
          id={`sch-nkm-${p}`}
          name="nextDueKm"
          type="number"
          min={0}
          defaultValue={schedule?.nextDueKm ?? ""}
        />
      </Field>
      <Field id={`sch-rdays-${p}`} label={t("reminderDaysBefore")}>
        <Input
          id={`sch-rdays-${p}`}
          name="reminderDaysBefore"
          type="number"
          min={0}
          defaultValue={schedule?.reminderDaysBefore ?? 14}
        />
      </Field>
      <div className="sm:col-span-3">
        <Button type="submit" variant="outline" size="sm" loading={pending}>
          {t("saveSchedule")}
        </Button>
      </div>
    </form>
  );
}

export function RecordForm({ vehicleId }: { vehicleId: string }) {
  const t = useTranslations("maintenance");
  const [state, action, pending] = useActionState(createRecordAction, initial);
  return (
    <form
      action={action}
      className="grid gap-3 rounded-xl border border-sand-200 bg-white p-5 sm:grid-cols-2"
    >
      <h3 className="font-semibold sm:col-span-2">{t("addRecord")}</h3>
      <input type="hidden" name="vehicleId" value={vehicleId} />
      <div className="sm:col-span-2">
        <Result state={state} />
      </div>
      <Field id="rec-type" label={t("type")} required>
        <Select id="rec-type" name="type" defaultValue="REPAIR">
          {TYPES.map((x) => (
            <option key={x} value={x}>
              {t(`types.${x}`)}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="rec-title" label={t("title")} required>
        <Input id="rec-title" name="title" required minLength={3} maxLength={140} />
      </Field>
      <Field id="rec-desc" label={t("description")} className="sm:col-span-2">
        <Textarea id="rec-desc" name="description" className="min-h-16" maxLength={2000} />
      </Field>
      <Field id="rec-date" label={t("scheduledFor")}>
        <Input id="rec-date" name="scheduledFor" type="date" />
      </Field>
      <Field id="rec-quote" label={t("quoteXaf")} hint={t("quoteHint")}>
        <Input id="rec-quote" name="quoteXaf" type="number" min={0} step={1} />
      </Field>
      <Field id="rec-provider" label={t("providerName")}>
        <Input id="rec-provider" name="providerName" maxLength={120} />
      </Field>
      <Field id="rec-contact" label={t("providerContact")}>
        <Input id="rec-contact" name="providerContact" maxLength={120} />
      </Field>
      <Field id="rec-dstart" label={t("downtimeStart")}>
        <Input id="rec-dstart" name="downtimeStart" type="date" />
      </Field>
      <Field id="rec-dend" label={t("downtimeEnd")}>
        <Input id="rec-dend" name="downtimeEnd" type="date" />
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" loading={pending}>
          {t("createRecord")}
        </Button>
      </div>
    </form>
  );
}

export function RecordTransitionForm({
  recordId,
  status,
}: {
  recordId: string;
  status: MaintenanceStatus;
}) {
  const t = useTranslations("maintenance");
  const [state, action, pending] = useActionState(transitionRecordAction, initial);
  const targets = MAINTENANCE_TRANSITIONS[status];
  if (targets.length === 0) return null;
  return (
    <form
      action={action}
      className="grid gap-2 rounded-lg border border-sand-200 bg-sand-50 p-3 sm:grid-cols-4"
    >
      <input type="hidden" name="recordId" value={recordId} />
      <div className="sm:col-span-4">
        <Result state={state} />
      </div>
      {targets.includes("COMPLETED") ? (
        <>
          <Field id={`tr-cost-${recordId}`} label={t("finalCostXaf")}>
            <Input id={`tr-cost-${recordId}`} name="finalCostXaf" type="number" min={0} step={1} />
          </Field>
          <Field id={`tr-km-${recordId}`} label={t("mileageKm")}>
            <Input id={`tr-km-${recordId}`} name="mileageKm" type="number" min={0} step={1} />
          </Field>
        </>
      ) : null}
      {targets.includes("IN_PROGRESS") ? (
        <>
          <Field id={`tr-ds-${recordId}`} label={t("downtimeStart")}>
            <Input id={`tr-ds-${recordId}`} name="downtimeStart" type="date" />
          </Field>
          <Field id={`tr-de-${recordId}`} label={t("downtimeEnd")}>
            <Input id={`tr-de-${recordId}`} name="downtimeEnd" type="date" />
          </Field>
        </>
      ) : null}
      <Field id={`tr-note-${recordId}`} label={t("note")} className="sm:col-span-2">
        <Input id={`tr-note-${recordId}`} name="note" maxLength={500} />
      </Field>
      <div className="flex flex-wrap items-end gap-2 sm:col-span-4">
        {targets.map((to) => (
          <Button
            key={to}
            type="submit"
            name="to"
            value={to}
            size="sm"
            variant={to === "CANCELLED" ? "danger" : to === "COMPLETED" ? "primary" : "outline"}
            loading={pending}
          >
            {t(`statuses.${to}`)}
          </Button>
        ))}
      </div>
    </form>
  );
}

export function OwnerMaintenanceDecision({ recordId }: { recordId: string }) {
  const t = useTranslations("maintenance.owner");
  const [state, action, pending] = useActionState(ownerDecideMaintenanceAction, initial);
  if (state.ok)
    return (
      <Alert tone="success">
        {state.message === "OWNER_APPROVED" ? t("approved") : t("declined")}
      </Alert>
    );
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="recordId" value={recordId} />
      <Result state={state} />
      <Field id={`own-note-${recordId}`} label={t("note")} className="min-w-48 flex-1">
        <Input id={`own-note-${recordId}`} name="note" maxLength={500} />
      </Field>
      <Button type="submit" name="decision" value="APPROVE" size="sm" loading={pending}>
        {t("approve")}
      </Button>
      <Button
        type="submit"
        name="decision"
        value="DECLINE"
        size="sm"
        variant="danger"
        loading={pending}
      >
        {t("decline")}
      </Button>
    </form>
  );
}
