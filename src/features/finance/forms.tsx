"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { ActionForm } from "@/components/ui/action-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";

import {
  adjustmentAction,
  decideExpenseAction,
  decidePayoutAction,
  issueStatementAction,
  ledgerCatchUpAction,
  markPayoutPaidAction,
  processPayoutAction,
  requestPayoutAction,
  type FinanceActionResult,
} from "./actions";

const initial: FinanceActionResult = { ok: false };

function Result({ state }: { state: FinanceActionResult }) {
  const t = useTranslations("finance.result");
  if (!state.message) return null;
  const key = state.message.startsWith("CATCH_UP:") ? "CATCH_UP" : state.message;
  return (
    <Alert tone={state.ok ? "success" : "danger"}>
      {t.has(key as "INVALID")
        ? t(key as "INVALID", { n: state.message.split(":")[1] ?? "" })
        : state.message}
    </Alert>
  );
}

export function RequestPayoutForm({
  ownerProfileId,
  availableXaf,
  asOwner,
  defaultStart,
  defaultEnd,
}: {
  ownerProfileId: string;
  availableXaf: number;
  asOwner?: boolean;
  defaultStart: string;
  defaultEnd: string;
}) {
  const t = useTranslations("finance.payouts");
  const [state, action, pending] = useActionState(requestPayoutAction, initial);
  if (availableXaf <= 0) return <p className="text-sm text-sand-600">{t("nothingAvailable")}</p>;
  return (
    <ActionForm
      action={action}
      state={state}
      className="grid gap-3 rounded-xl border border-sand-200 bg-white p-5 sm:grid-cols-3"
    >
      <h3 className="font-semibold sm:col-span-3">{t("request")}</h3>
      <input type="hidden" name="ownerProfileId" value={ownerProfileId} />
      {asOwner ? <input type="hidden" name="asOwner" value="1" /> : null}
      <div className="sm:col-span-3">
        <Result state={state} />
      </div>
      <Field
        id={`po-amount-${ownerProfileId}`}
        label={t("amountXaf")}
        hint={t("maxAvailable", { max: availableXaf })}
        required
      >
        <Input
          id={`po-amount-${ownerProfileId}`}
          name="amountXaf"
          type="number"
          min={1}
          max={availableXaf}
          step={1}
          defaultValue={availableXaf}
          required
        />
      </Field>
      <Field id={`po-start-${ownerProfileId}`} label={t("periodStart")} required>
        <Input
          id={`po-start-${ownerProfileId}`}
          name="periodStart"
          type="date"
          defaultValue={defaultStart}
          required
        />
      </Field>
      <Field id={`po-end-${ownerProfileId}`} label={t("periodEnd")} required>
        <Input
          id={`po-end-${ownerProfileId}`}
          name="periodEnd"
          type="date"
          defaultValue={defaultEnd}
          required
        />
      </Field>
      <div className="sm:col-span-3">
        <Button type="submit" loading={pending}>
          {t("requestButton")}
        </Button>
      </div>
    </ActionForm>
  );
}

export function PayoutDecisionForm({
  payoutId,
  canDecide,
  canProcess,
  status,
  manual,
}: {
  payoutId: string;
  canDecide: boolean;
  canProcess: boolean;
  status: string;
  manual: boolean;
}) {
  const t = useTranslations("finance.payouts");
  const [state, decide, deciding] = useActionState(decidePayoutAction, initial);
  const [pState, process, processing] = useActionState(processPayoutAction, initial);
  const [mState, markPaid, marking] = useActionState(markPayoutPaidAction, initial);
  return (
    <div className="space-y-2">
      <Result state={state} />
      <Result state={pState} />
      <Result state={mState} />
      {status === "PENDING_APPROVAL" && canDecide ? (
        <ActionForm action={decide} state={state} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="payoutId" value={payoutId} />
          <Field id={`po-comment-${payoutId}`} label={t("comment")} className="min-w-40 flex-1">
            <Input id={`po-comment-${payoutId}`} name="comment" maxLength={500} />
          </Field>
          <Button type="submit" name="decision" value="APPROVED" size="sm" loading={deciding}>
            {t("approve")}
          </Button>
          <Button
            type="submit"
            name="decision"
            value="REJECTED"
            size="sm"
            variant="danger"
            loading={deciding}
          >
            {t("reject")}
          </Button>
        </ActionForm>
      ) : null}
      {status === "APPROVED" && canProcess ? (
        <ActionForm action={process} state={pState}>
          <input type="hidden" name="payoutId" value={payoutId} />
          <Button type="submit" size="sm" loading={processing}>
            {t("process")}
          </Button>
        </ActionForm>
      ) : null}
      {status === "PROCESSING" && manual && canProcess ? (
        <ActionForm action={markPaid} state={mState} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="payoutId" value={payoutId} />
          <Field
            id={`po-ref-${payoutId}`}
            label={t("bankReference")}
            className="min-w-40 flex-1"
            required
          >
            <Input
              id={`po-ref-${payoutId}`}
              name="reference"
              required
              minLength={3}
              maxLength={120}
            />
          </Field>
          <Button type="submit" size="sm" variant="outline" loading={marking}>
            {t("markPaid")}
          </Button>
        </ActionForm>
      ) : null}
    </div>
  );
}

export function ExpenseDecisionForm({
  expenseId,
  amountXaf,
  hasOwner,
}: {
  expenseId: string;
  amountXaf: number;
  hasOwner: boolean;
}) {
  const t = useTranslations("finance.expenses");
  const [state, action, pending] = useActionState(decideExpenseAction, initial);
  return (
    <ActionForm action={action} state={state} className="grid gap-2 sm:grid-cols-4 sm:items-end">
      <input type="hidden" name="expenseId" value={expenseId} />
      <div className="sm:col-span-4">
        <Result state={state} />
      </div>
      <Field id={`ex-alloc-${expenseId}`} label={t("allocation")}>
        <Select
          id={`ex-alloc-${expenseId}`}
          name="allocation"
          defaultValue={hasOwner ? "OWNER" : "RIDEKMER"}
        >
          {hasOwner ? <option value="OWNER">{t("allocations.OWNER")}</option> : null}
          <option value="RIDEKMER">{t("allocations.RIDEKMER")}</option>
          {hasOwner ? <option value="SHARED">{t("allocations.SHARED")}</option> : null}
          <option value="CUSTOMER">{t("allocations.CUSTOMER")}</option>
        </Select>
      </Field>
      <Field id={`ex-share-${expenseId}`} label={t("ownerShareXaf")} hint={t("ownerShareHint")}>
        <Input
          id={`ex-share-${expenseId}`}
          name="ownerShareXaf"
          type="number"
          min={0}
          max={amountXaf}
          step={1}
        />
      </Field>
      <Field id={`ex-note-${expenseId}`} label={t("note")}>
        <Input id={`ex-note-${expenseId}`} name="note" maxLength={500} />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" name="decision" value="ALLOCATE" size="sm" loading={pending}>
          {t("allocate")}
        </Button>
        <Button
          type="submit"
          name="decision"
          value="REJECT"
          size="sm"
          variant="danger"
          loading={pending}
        >
          {t("reject")}
        </Button>
      </div>
    </ActionForm>
  );
}

export function AdjustmentForm({ owners }: { owners: Array<{ id: string; name: string }> }) {
  const t = useTranslations("finance.ledger");
  const [state, action, pending] = useActionState(adjustmentAction, initial);
  return (
    <ActionForm
      action={action}
      state={state}
      className="grid gap-3 rounded-xl border border-sand-200 bg-white p-5 sm:grid-cols-3"
    >
      <h3 className="font-semibold sm:col-span-3">{t("adjustment")}</h3>
      <p className="text-xs text-sand-600 sm:col-span-3">{t("adjustmentHint")}</p>
      <div className="sm:col-span-3">
        <Result state={state} />
      </div>
      <Field id="adj-owner" label={t("owner")} required>
        <Select id="adj-owner" name="ownerProfileId" required>
          {owners.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="adj-amount" label={t("amountXaf")} hint={t("amountHint")} required>
        <Input id="adj-amount" name="amountXaf" type="number" step={1} required />
      </Field>
      <Field id="adj-reason" label={t("reason")} required>
        <Textarea
          id="adj-reason"
          name="reason"
          required
          minLength={5}
          maxLength={300}
          className="min-h-11"
        />
      </Field>
      <div className="sm:col-span-3">
        <Button type="submit" variant="outline" loading={pending}>
          {t("post")}
        </Button>
      </div>
    </ActionForm>
  );
}

export function IssueStatementForm({
  owners,
  defaultMonth,
}: {
  owners: Array<{ id: string; name: string }>;
  defaultMonth: string;
}) {
  const t = useTranslations("finance.statements");
  const [state, action, pending] = useActionState(issueStatementAction, initial);
  return (
    <ActionForm
      action={action}
      state={state}
      className="flex flex-wrap items-end gap-2 rounded-xl border border-sand-200 bg-white p-5"
    >
      <h3 className="w-full font-semibold">{t("issue")}</h3>
      <div className="w-full">
        <Result state={state} />
      </div>
      <Field id="st-owner" label={t("owner")} className="min-w-48 flex-1">
        <Select id="st-owner" name="ownerProfileId">
          {owners.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="st-month" label={t("month")}>
        <Input id="st-month" name="month" type="month" defaultValue={defaultMonth} />
      </Field>
      <Button type="submit" variant="outline" loading={pending}>
        {t("issueButton")}
      </Button>
    </ActionForm>
  );
}

export function LedgerCatchUpForm() {
  const t = useTranslations("finance.ledger");
  const [state, action, pending] = useActionState(ledgerCatchUpAction, initial);
  return (
    <ActionForm action={action} state={state} className="flex flex-wrap items-center gap-3">
      <Button type="submit" variant="outline" size="sm" loading={pending}>
        {t("catchUp")}
      </Button>
      <Result state={state} />
    </ActionForm>
  );
}
