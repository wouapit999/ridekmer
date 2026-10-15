"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

import {
  createOverrideAction,
  decideVerificationCaseAction,
  reviewVehicleAction,
  reviewVehicleDocumentAction,
  reviewVerificationDocumentAction,
  saveDocumentTypeAction,
  type ReviewActionResult,
} from "./review-actions";

const initial: ReviewActionResult = { ok: false };

function ResultAlert({
  state,
  ns,
}: {
  state: ReviewActionResult;
  ns: "admin.vehicles.result" | "admin.verifications.result";
}) {
  const t = useTranslations(ns);
  if (!state.message) return null;
  const key = state.message as "APPROVED";
  const text = t.has(key) ? t(key) : state.message;
  return (
    <Alert tone={state.ok ? "success" : "danger"}>
      {text}
      {state.details?.length ? ` (${state.details.join(", ")})` : ""}
    </Alert>
  );
}

export function DocumentReviewForm({
  documentId,
  kind,
  status,
}: {
  documentId: string;
  kind: "vehicle" | "verification";
  status: string;
}) {
  const t = useTranslations("admin.vehicles");
  const [state, action, pending] = useActionState(
    kind === "vehicle" ? reviewVehicleDocumentAction : reviewVerificationDocumentAction,
    initial,
  );
  if (!["SUBMITTED", "UNDER_REVIEW"].includes(status))
    return state.message ? <ResultAlert state={state} ns="admin.vehicles.result" /> : null;
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="documentId" value={documentId} />
      <ResultAlert state={state} ns="admin.vehicles.result" />
      <Field id={`reason-${documentId}`} label={t("reason")} className="min-w-48 flex-1">
        <Input id={`reason-${documentId}`} name="reason" maxLength={500} />
      </Field>
      <Button type="submit" name="decision" value="VERIFIED" size="sm" loading={pending}>
        {t("verify")}
      </Button>
      <Button
        type="submit"
        name="decision"
        value="REJECTED"
        size="sm"
        variant="danger"
        loading={pending}
      >
        {t("reject")}
      </Button>
    </form>
  );
}

export function VehicleDecisionForm({
  vehicleId,
  status,
  permissions,
}: {
  vehicleId: string;
  status: string;
  permissions: string[];
}) {
  const t = useTranslations("admin.vehicles");
  const [state, action, pending] = useActionState(reviewVehicleAction, initial);
  const can = (p: string) => permissions.includes(p);
  const buttons: Array<{
    decision: string;
    label: string;
    variant: "primary" | "danger" | "outline";
    show: boolean;
  }> = [
    {
      decision: "UNDER_REVIEW",
      label: t("startReview"),
      variant: "outline",
      show: status === "SUBMITTED" && can("vehicle.review"),
    },
    {
      decision: "APPROVED",
      label: t("approve"),
      variant: "primary",
      show: ["SUBMITTED", "UNDER_REVIEW"].includes(status) && can("vehicle.approve"),
    },
    {
      decision: "REJECTED",
      label: t("rejectVehicle"),
      variant: "danger",
      show: ["SUBMITTED", "UNDER_REVIEW"].includes(status) && can("vehicle.approve"),
    },
    {
      decision: "SUSPENDED",
      label: t("suspend"),
      variant: "danger",
      show:
        ["ACTIVE", "APPROVED", "UNAVAILABLE_DOCUMENTS"].includes(status) && can("vehicle.suspend"),
    },
    {
      decision: "ACTIVE",
      label: t("reinstate"),
      variant: "primary",
      show: status === "SUSPENDED" && can("vehicle.suspend"),
    },
    {
      decision: "WITHDRAWN",
      label: t("withdraw"),
      variant: "outline",
      show:
        ["ACTIVE", "APPROVED", "SUSPENDED", "UNAVAILABLE_DOCUMENTS"].includes(status) &&
        can("vehicle.withdraw"),
    },
  ];
  if (!buttons.some((b) => b.show)) return null;
  return (
    <form action={action} className="space-y-3 rounded-xl border border-sand-200 bg-white p-5">
      <h2 className="text-lg font-semibold">{t("decision")}</h2>
      <input type="hidden" name="vehicleId" value={vehicleId} />
      <ResultAlert state={state} ns="admin.vehicles.result" />
      <Field id="decisionReason" label={t("decisionReason")}>
        <Input id="decisionReason" name="reason" maxLength={500} />
      </Field>
      <div className="flex flex-wrap gap-2">
        {buttons
          .filter((b) => b.show)
          .map((b) => (
            <Button
              key={b.decision}
              type="submit"
              name="decision"
              value={b.decision}
              variant={b.variant}
              loading={pending}
            >
              {b.label}
            </Button>
          ))}
      </div>
    </form>
  );
}

export function OverrideForm({ vehicleId }: { vehicleId: string }) {
  const t = useTranslations("admin.vehicles");
  const [state, action, pending] = useActionState(createOverrideAction, initial);
  return (
    <form
      action={action}
      className="space-y-3 rounded-xl border border-accent-300 bg-accent-50 p-5"
    >
      <h2 className="text-lg font-semibold">{t("overrides")}</h2>
      <p className="text-sm text-sand-700">{t("overrideIntro")}</p>
      <input type="hidden" name="vehicleId" value={vehicleId} />
      <ResultAlert state={state} ns="admin.vehicles.result" />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field id="overrideDays" label={t("overrideDays")} required>
          <Input
            id="overrideDays"
            name="days"
            type="number"
            min={1}
            max={30}
            defaultValue={7}
            required
          />
        </Field>
        <Field id="overrideReason" label={t("overrideReason")} required className="sm:col-span-2">
          <Input id="overrideReason" name="reason" required minLength={3} maxLength={500} />
        </Field>
      </div>
      <Button type="submit" variant="secondary" loading={pending}>
        {t("createOverride")}
      </Button>
    </form>
  );
}

export function CaseDecisionForm({
  caseId,
  caseType,
  ownerProfileId,
  allVerified,
}: {
  caseId: string;
  caseType: string;
  ownerProfileId?: string;
  allVerified: boolean;
}) {
  const t = useTranslations("admin.verifications");
  const [state, action, pending] = useActionState(decideVerificationCaseAction, initial);
  return (
    <form action={action} className="space-y-3 rounded-xl border border-sand-200 bg-white p-5">
      <input type="hidden" name="caseId" value={caseId} />
      <input type="hidden" name="caseType" value={caseType} />
      {ownerProfileId ? <input type="hidden" name="ownerProfileId" value={ownerProfileId} /> : null}
      <ResultAlert state={state} ns="admin.verifications.result" />
      {!allVerified ? <p className="text-sm text-accent-700">{t("allVerified")}</p> : null}
      <Field id="caseReason" label={t("reason")}>
        <Input id="caseReason" name="reason" maxLength={500} />
      </Field>
      <div className="flex gap-2">
        <Button
          type="submit"
          name="decision"
          value="APPROVE"
          disabled={!allVerified}
          loading={pending}
        >
          {t("approveCase")}
        </Button>
        <Button type="submit" name="decision" value="REJECT" variant="danger" loading={pending}>
          {t("rejectCase")}
        </Button>
      </div>
    </form>
  );
}

export function DocumentTypeForm({
  existing,
}: {
  existing?: {
    key: string;
    subjectType: string;
    nameFr: string;
    nameEn: string;
    isMandatory: boolean;
    requiresExpiry: boolean;
    requiresNumber: boolean;
    blocksVehicleWhenExpired: boolean;
    isActive: boolean;
    alertDaysBefore: number[];
  };
}) {
  const t = useTranslations("admin.settings");
  const [state, action, pending] = useActionState(saveDocumentTypeAction, initial);
  const flags = [
    ["isMandatory", t("dtMandatory")],
    ["requiresExpiry", t("dtRequiresExpiry")],
    ["requiresNumber", t("dtRequiresNumber")],
    ["blocksVehicleWhenExpired", t("dtBlocks")],
    ["isActive", t("dtActive")],
  ] as const;
  return (
    <form
      action={action}
      className="grid gap-4 rounded-xl border border-sand-200 bg-white p-5 sm:grid-cols-2"
    >
      <h3 className="text-lg font-semibold sm:col-span-2">{t("editDocumentType")}</h3>
      {state.message ? (
        <div className="sm:col-span-2">
          <Alert tone={state.ok ? "success" : "danger"}>
            {state.ok ? t("dtSaved") : t("dtInvalid")}
          </Alert>
        </div>
      ) : null}
      <Field id="dt-key" label={t("dtKey")} required>
        <Input
          id="dt-key"
          name="key"
          pattern="[a-z0-9_]{3,60}"
          defaultValue={existing?.key}
          required
          readOnly={Boolean(existing)}
        />
      </Field>
      <Field id="dt-subject" label={t("dtSubject")} required>
        <select
          id="dt-subject"
          name="subjectType"
          defaultValue={existing?.subjectType ?? "VEHICLE"}
          className="block min-h-11 w-full rounded-md border border-sand-300 bg-white px-3 py-2.5"
        >
          {["VEHICLE", "OWNER", "COMPANY", "CUSTOMER", "CHAUFFEUR", "CONTRACT"].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>
      <Field id="dt-nameFr" label={t("dtNameFr")} required>
        <Input id="dt-nameFr" name="nameFr" defaultValue={existing?.nameFr} required />
      </Field>
      <Field id="dt-nameEn" label={t("dtNameEn")} required>
        <Input id="dt-nameEn" name="nameEn" defaultValue={existing?.nameEn} required />
      </Field>
      <Field id="dt-alert" label={t("dtAlertDays")} required className="sm:col-span-2">
        <Input
          id="dt-alert"
          name="alertDaysBefore"
          defaultValue={(existing?.alertDaysBefore ?? [60, 30, 14, 7, 0]).join(", ")}
          required
        />
      </Field>
      <div className="grid gap-2 sm:col-span-2 sm:grid-cols-2">
        {flags.map(([name, label]) => (
          <label key={name} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name={name}
              defaultChecked={existing ? Boolean(existing[name]) : name === "isActive"}
              className="h-4 w-4"
            />{" "}
            {label}
          </label>
        ))}
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" loading={pending}>
          {t("dtSave")}
        </Button>
      </div>
    </form>
  );
}
