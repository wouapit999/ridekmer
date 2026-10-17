"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { ActionForm } from "@/components/ui/action-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { useRouter } from "@/i18n/navigation";
import { enumLabel } from "@/lib/i18n-enum";

import {
  incidentResolutionAction,
  insuranceClaimAction,
  reportIncidentAction,
  transitionIncidentAction,
  type IncidentActionResult,
} from "./actions";
import { INCIDENT_TRANSITIONS } from "./state-machine";

import type { IncidentStatus } from "@/generated/prisma/enums";

const initial: IncidentActionResult = { ok: false };
const TYPES = ["ACCIDENT", "DAMAGE", "BREAKDOWN", "THEFT", "OTHER"] as const;

function Result({ state }: { state: IncidentActionResult }) {
  const t = useTranslations("incidents.result");
  if (!state.message) return null;
  return (
    <Alert tone={state.ok ? "success" : "danger"}>
      {t.has(state.message as "REPORTED") ? t(state.message as "REPORTED") : state.message}
    </Alert>
  );
}

export function ReportIncidentForm({
  bookingId,
  vehicleId,
  asStaff,
  redirectTo,
}: {
  bookingId?: string;
  vehicleId?: string;
  asStaff?: boolean;
  redirectTo?: string;
}) {
  const t = useTranslations("incidents");
  const router = useRouter();
  const [state, action, pending] = useActionState(
    async (prev: IncidentActionResult, fd: FormData) => {
      const r = await reportIncidentAction(prev, fd);
      if (r.ok && redirectTo) router.push(redirectTo);
      return r;
    },
    initial,
  );
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
  return (
    <ActionForm
      action={action}
      state={state}
      encType="multipart/form-data"
      className="space-y-4 rounded-xl border border-sand-200 bg-white p-5"
    >
      {bookingId ? <input type="hidden" name="bookingId" value={bookingId} /> : null}
      {vehicleId ? <input type="hidden" name="vehicleId" value={vehicleId} /> : null}
      {asStaff ? <input type="hidden" name="asStaff" value="1" /> : null}
      <Result state={state} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="inc-type" label={t("type")} required>
          <Select id="inc-type" name="type" required>
            {TYPES.map((x) => (
              <option key={x} value={x}>
                {t(`types.${x}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="inc-at" label={t("occurredAt")} required>
          <Input
            id="inc-at"
            name="occurredAt"
            type="datetime-local"
            defaultValue={local}
            max={local}
            required
          />
        </Field>
      </div>
      <Field id="inc-desc" label={t("description")} required hint={t("descriptionHint")}>
        <Textarea
          id="inc-desc"
          name="description"
          required
          minLength={10}
          maxLength={3000}
          className="min-h-24"
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="inc-loc" label={t("location")}>
          <Input id="inc-loc" name="locationDescription" maxLength={300} />
        </Field>
        <Field id="inc-police" label={t("policeReport")}>
          <Input id="inc-police" name="policeReportNumber" maxLength={80} />
        </Field>
      </div>
      <Field id="inc-photos" label={t("photos")} hint={t("photosHint")}>
        <Input
          id="inc-photos"
          name="photos"
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          multiple
          capture="environment"
        />
      </Field>
      {asStaff ? (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox name="blockVehicle" value="1" />
          {t("blockVehicle")}
        </label>
      ) : null}
      <Button type="submit" loading={pending} size="lg">
        {t("report")}
      </Button>
    </ActionForm>
  );
}

export function IncidentTransitionForm({
  incidentId,
  status,
}: {
  incidentId: string;
  status: IncidentStatus;
}) {
  const t = useTranslations("incidents");
  const [state, action, pending] = useActionState(transitionIncidentAction, initial);
  const targets = INCIDENT_TRANSITIONS[status];
  if (targets.length === 0) return null;
  return (
    <ActionForm
      action={action}
      state={state}
      className="space-y-3 rounded-xl border border-sand-200 bg-white p-5"
    >
      <h2 className="font-semibold">{t("admin.transitions")}</h2>
      <input type="hidden" name="incidentId" value={incidentId} />
      <Result state={state} />
      <Field id="inc-note" label={t("admin.note")}>
        <Input id="inc-note" name="note" maxLength={500} />
      </Field>
      <div className="flex flex-wrap gap-2">
        {targets.map((to) => (
          <Button
            key={to}
            type="submit"
            name="to"
            value={to}
            size="sm"
            variant={to === "CLOSED" || to === "DISPUTED" ? "danger" : "outline"}
            loading={pending}
          >
            {t(`statuses.${to}`)}
          </Button>
        ))}
      </div>
    </ActionForm>
  );
}

export function IncidentResolutionForm({
  incidentId,
  defaults,
}: {
  incidentId: string;
  defaults: {
    repairEstimateXaf: number | null;
    customerLiableXaf: number | null;
    depositDeductionXaf: number | null;
    responsibilityNotes: string | null;
    resolutionNotes: string | null;
  };
}) {
  const t = useTranslations("incidents.admin");
  const [state, action, pending] = useActionState(incidentResolutionAction, initial);
  return (
    <ActionForm
      action={action}
      state={state}
      className="space-y-3 rounded-xl border border-sand-200 bg-white p-5"
    >
      <h2 className="font-semibold">{t("resolution")}</h2>
      <p className="text-xs text-sand-600">{t("resolutionHint")}</p>
      <input type="hidden" name="incidentId" value={incidentId} />
      <Result state={state} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field id="res-estimate" label={t("repairEstimateXaf")}>
          <Input
            id="res-estimate"
            name="repairEstimateXaf"
            type="number"
            min={0}
            step={1}
            defaultValue={defaults.repairEstimateXaf ?? ""}
          />
        </Field>
        <Field id="res-liable" label={t("customerLiableXaf")}>
          <Input
            id="res-liable"
            name="customerLiableXaf"
            type="number"
            min={0}
            step={1}
            defaultValue={defaults.customerLiableXaf ?? ""}
          />
        </Field>
        <Field id="res-deduction" label={t("depositDeductionXaf")}>
          <Input
            id="res-deduction"
            name="depositDeductionXaf"
            type="number"
            min={0}
            step={1}
            defaultValue={defaults.depositDeductionXaf ?? ""}
          />
        </Field>
      </div>
      <Field id="res-resp" label={t("responsibilityNotes")}>
        <Textarea
          id="res-resp"
          name="responsibilityNotes"
          defaultValue={defaults.responsibilityNotes ?? ""}
          className="min-h-16"
        />
      </Field>
      <Field id="res-notes" label={t("resolutionNotes")}>
        <Textarea
          id="res-notes"
          name="resolutionNotes"
          defaultValue={defaults.resolutionNotes ?? ""}
          className="min-h-16"
        />
      </Field>
      <Button type="submit" variant="outline" loading={pending}>
        {t("saveResolution")}
      </Button>
    </ActionForm>
  );
}

export function InsuranceClaimForm({
  incidentId,
  claim,
}: {
  incidentId: string;
  claim?: {
    id: string;
    insurerName: string;
    claimReference: string | null;
    status: string;
    claimedXaf: number | null;
    settledXaf: number | null;
    notes: string | null;
  } | null;
}) {
  const t = useTranslations("incidents.admin");
  const te = useTranslations("enums");
  const [state, action, pending] = useActionState(insuranceClaimAction, initial);
  return (
    <ActionForm
      action={action}
      state={state}
      className="space-y-3 rounded-xl border border-sand-200 bg-white p-5"
    >
      <h2 className="font-semibold">{claim ? t("claimUpdate") : t("claimNew")}</h2>
      <input type="hidden" name="incidentId" value={incidentId} />
      {claim ? <input type="hidden" name="claimId" value={claim.id} /> : null}
      <Result state={state} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={`claim-ins-${claim?.id ?? "new"}`} label={t("insurerName")} required>
          <Input
            id={`claim-ins-${claim?.id ?? "new"}`}
            name="insurerName"
            defaultValue={claim?.insurerName ?? ""}
            required
          />
        </Field>
        <Field id={`claim-ref-${claim?.id ?? "new"}`} label={t("claimReference")}>
          <Input
            id={`claim-ref-${claim?.id ?? "new"}`}
            name="claimReference"
            defaultValue={claim?.claimReference ?? ""}
          />
        </Field>
        <Field id={`claim-status-${claim?.id ?? "new"}`} label={t("claimStatus")} required>
          <Select
            id={`claim-status-${claim?.id ?? "new"}`}
            name="status"
            defaultValue={claim?.status ?? "DRAFT"}
          >
            {["DRAFT", "SUBMITTED", "IN_PROGRESS", "SETTLED", "REJECTED", "CLOSED"].map((s) => (
              <option key={s} value={s}>
                {enumLabel(te, "claimStatus", s)}
              </option>
            ))}
          </Select>
        </Field>
        <Field id={`claim-amt-${claim?.id ?? "new"}`} label={t("claimedXaf")}>
          <Input
            id={`claim-amt-${claim?.id ?? "new"}`}
            name="claimedXaf"
            type="number"
            min={0}
            step={1}
            defaultValue={claim?.claimedXaf ?? ""}
          />
        </Field>
        <Field id={`claim-settled-${claim?.id ?? "new"}`} label={t("settledXaf")}>
          <Input
            id={`claim-settled-${claim?.id ?? "new"}`}
            name="settledXaf"
            type="number"
            min={0}
            step={1}
            defaultValue={claim?.settledXaf ?? ""}
          />
        </Field>
      </div>
      <Field id={`claim-notes-${claim?.id ?? "new"}`} label={t("notes")}>
        <Input
          id={`claim-notes-${claim?.id ?? "new"}`}
          name="notes"
          defaultValue={claim?.notes ?? ""}
        />
      </Field>
      <Button type="submit" variant="outline" size="sm" loading={pending}>
        {t("saveClaim")}
      </Button>
    </ActionForm>
  );
}
