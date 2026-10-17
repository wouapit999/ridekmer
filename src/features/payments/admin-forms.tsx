"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { ActionForm } from "@/components/ui/action-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";

import {
  completeManualRefundAction,
  confirmManualPaymentAction,
  decideRefundAction,
  recordManualPaymentAction,
  refreshPaymentAdminAction,
  requestRefundAction,
  type PaymentActionResult,
} from "./actions";

const initial: PaymentActionResult = { ok: false };

function Result({ state }: { state: PaymentActionResult }) {
  const t = useTranslations("payments.admin.result");
  if (!state.message) return null;
  return (
    <Alert tone={state.ok ? "success" : "danger"}>
      {t.has(state.message as "INVALID") ? t(state.message as "INVALID") : state.message}
    </Alert>
  );
}

export function ManualPaymentForm({
  bookingId,
  amountXaf,
  methods,
}: {
  bookingId: string;
  amountXaf: number;
  methods: Array<"CASH" | "BANK_TRANSFER">;
}) {
  const t = useTranslations("payments.admin");
  const tm = useTranslations("payments.methods");
  const [state, action, pending] = useActionState(recordManualPaymentAction, initial);
  if (methods.length === 0) return null;
  return (
    <ActionForm
      action={action}
      state={state}
      className="space-y-3 rounded-xl border border-sand-200 bg-white p-5"
    >
      <h2 className="text-lg font-semibold">{t("recordManual")}</h2>
      <p className="text-xs text-sand-600">{t("recordManualHint")}</p>
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="amountXaf" value={amountXaf} />
      <Result state={state} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="manualMethod" label={t("method")} required>
          <Select id="manualMethod" name="method" required>
            {methods.map((m) => (
              <option key={m} value={m}>
                {tm(m)}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="manualReference" label={t("reference")} required>
          <Input id="manualReference" name="reference" required minLength={3} maxLength={120} />
        </Field>
      </div>
      <Field id="manualNote" label={t("note")}>
        <Textarea id="manualNote" name="note" maxLength={500} className="min-h-16" />
      </Field>
      <Button type="submit" loading={pending}>
        {t("recordManualSubmit")}
      </Button>
    </ActionForm>
  );
}

export function ConfirmManualPaymentForm({ paymentId }: { paymentId: string }) {
  const t = useTranslations("payments.admin");
  const [state, action, pending] = useActionState(confirmManualPaymentAction, initial);
  return (
    <ActionForm
      action={action}
      state={state}
      className="space-y-3 rounded-xl border border-sand-200 bg-white p-5"
    >
      <h2 className="font-semibold">{t("confirmManual")}</h2>
      <input type="hidden" name="paymentId" value={paymentId} />
      <Result state={state} />
      <Field id="confirmReference" label={t("reference")} required>
        <Input id="confirmReference" name="reference" required minLength={3} maxLength={120} />
      </Field>
      <Field id="confirmNote" label={t("note")}>
        <Input id="confirmNote" name="note" maxLength={500} />
      </Field>
      <Button type="submit" loading={pending}>
        {t("confirmManualSubmit")}
      </Button>
    </ActionForm>
  );
}

export function RefreshPaymentForm({ paymentId }: { paymentId: string }) {
  const t = useTranslations("payments.admin");
  const [state, action, pending] = useActionState(refreshPaymentAdminAction, initial);
  return (
    <ActionForm action={action} state={state} className="space-y-2">
      <input type="hidden" name="paymentId" value={paymentId} />
      <Result state={state} />
      <Button type="submit" variant="outline" size="sm" loading={pending}>
        {t("refresh")}
      </Button>
    </ActionForm>
  );
}

export function RefundRequestForm({ paymentId, maxXaf }: { paymentId: string; maxXaf: number }) {
  const t = useTranslations("payments.admin");
  const [state, action, pending] = useActionState(requestRefundAction, initial);
  if (maxXaf <= 0) return null;
  return (
    <ActionForm
      action={action}
      state={state}
      className="space-y-3 rounded-xl border border-sand-200 bg-white p-5"
    >
      <h2 className="font-semibold">{t("requestRefund")}</h2>
      <input type="hidden" name="paymentId" value={paymentId} />
      <Result state={state} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          id="refundAmount"
          label={t("amountXaf")}
          hint={t("refundMax", { max: maxXaf })}
          required
        >
          <Input
            id="refundAmount"
            name="amountXaf"
            type="number"
            min={1}
            max={maxXaf}
            step={1}
            defaultValue={maxXaf}
            required
          />
        </Field>
        <Field id="refundReason" label={t("reason")} required>
          <Input id="refundReason" name="reason" required minLength={3} maxLength={500} />
        </Field>
      </div>
      <Button type="submit" variant="outline" loading={pending}>
        {t("requestRefundSubmit")}
      </Button>
    </ActionForm>
  );
}

export function RefundDecisionForm({
  refundId,
  canDecide,
}: {
  refundId: string;
  canDecide: boolean;
}) {
  const t = useTranslations("payments.admin");
  const [state, action, pending] = useActionState(decideRefundAction, initial);
  if (!canDecide) return null;
  return (
    <ActionForm action={action} state={state} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="refundId" value={refundId} />
      <Result state={state} />
      <Field id={`comment-${refundId}`} label={t("comment")} className="min-w-48 flex-1">
        <Input id={`comment-${refundId}`} name="comment" maxLength={500} />
      </Field>
      <Button type="submit" name="decision" value="APPROVED" size="sm" loading={pending}>
        {t("approve")}
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
    </ActionForm>
  );
}

export function CompleteManualRefundForm({ refundId }: { refundId: string }) {
  const t = useTranslations("payments.admin");
  const [state, action, pending] = useActionState(completeManualRefundAction, initial);
  return (
    <ActionForm action={action} state={state} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="refundId" value={refundId} />
      <Result state={state} />
      <Field id={`ref-${refundId}`} label={t("reference")} className="min-w-48 flex-1" required>
        <Input id={`ref-${refundId}`} name="reference" required minLength={3} maxLength={120} />
      </Field>
      <Button type="submit" size="sm" variant="outline" loading={pending}>
        {t("markRefundPaid")}
      </Button>
    </ActionForm>
  );
}
