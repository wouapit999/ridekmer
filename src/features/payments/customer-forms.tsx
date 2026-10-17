"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useState } from "react";

import { ActionForm } from "@/components/ui/action-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useRouter } from "@/i18n/navigation";

import {
  checkPaymentStatusAction,
  initiatePaymentAction,
  simulateMockPaymentAction,
  type PaymentActionResult,
} from "./actions";

const initial: PaymentActionResult = { ok: false };
const OPEN = ["CREATED", "PENDING", "REQUIRES_CUSTOMER_ACTION", "PROCESSING"];

export interface MethodOption {
  method: "MTN_MOBILE_MONEY" | "ORANGE_MONEY" | "CARD" | "BANK_TRANSFER";
  environment: "mock" | "sandbox" | "production";
  /** Recorded by hand and confirmed by finance (no operator API involved). */
  manual: boolean;
}

/** Company Mobile Money accounts the customer sends money to by hand. */
export interface ManualMobileMoneyAccounts {
  mtnNumber: string;
  orangeNumber: string;
  accountName: string;
}

export function PaymentMethodForm({
  bookingId,
  methods,
  defaultPhone,
  amount,
  accounts,
}: {
  bookingId: string;
  methods: MethodOption[];
  defaultPhone: string;
  /** Formatted amount due, shown in the hand-made transfer instructions. */
  amount: string;
  accounts: ManualMobileMoneyAccounts;
}) {
  const t = useTranslations("payments");
  const router = useRouter();
  const [method, setMethod] = useState<MethodOption["method"]>(
    methods[0]?.method ?? "MTN_MOBILE_MONEY",
  );
  const [state, action, pending] = useActionState(
    async (prev: PaymentActionResult, fd: FormData) => {
      const r = await initiatePaymentAction(prev, fd);
      if (r.ok && r.paymentId) {
        if (r.redirectUrl && !r.redirectUrl.includes("mockCardSession")) {
          window.location.assign(r.redirectUrl);
        } else {
          router.push(`/account/bookings/${bookingId}/pay?payment=${r.paymentId}`);
        }
      }
      return r;
    },
    initial,
  );
  const needsPhone = method === "MTN_MOBILE_MONEY" || method === "ORANGE_MONEY";
  const manualTransfer = needsPhone && methods.find((m) => m.method === method)?.manual === true;
  return (
    <ActionForm action={action} state={state} className="space-y-4">
      <input type="hidden" name="bookingId" value={bookingId} />
      {!state.ok && state.message ? (
        <Alert tone="danger">
          {t.has(`errors.${state.message}` as "errors.INVALID")
            ? t(`errors.${state.message}` as "errors.INVALID")
            : state.message}
        </Alert>
      ) : null}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-sand-800">{t("chooseMethod")}</legend>
        {methods.map((m) => (
          <label
            key={m.method}
            className="flex cursor-pointer items-center gap-3 rounded-lg border border-sand-200 bg-white px-4 py-3 has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50"
          >
            <input
              type="radio"
              name="method"
              value={m.method}
              checked={method === m.method}
              onChange={() => setMethod(m.method)}
              className="h-4 w-4"
            />
            <span className="font-medium">{t(`methods.${m.method}`)}</span>
            {m.environment === "mock" ? (
              <span className="ml-auto rounded-full bg-accent-100 px-2 py-0.5 text-xs text-accent-700">
                {t("mockLabel")}
              </span>
            ) : null}
          </label>
        ))}
      </fieldset>
      {manualTransfer ? (
        <ManualTransferInstructions
          method={method as "MTN_MOBILE_MONEY" | "ORANGE_MONEY"}
          amount={amount}
          accounts={accounts}
        />
      ) : null}
      {manualTransfer ? (
        <Field
          id="transactionId"
          label={t("manualMomo.transactionId")}
          hint={t("manualMomo.transactionIdHint")}
          required
        >
          <Input
            id="transactionId"
            name="transactionId"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={64}
            required
          />
        </Field>
      ) : null}
      {needsPhone ? (
        <Field
          id="payerPhone"
          label={manualTransfer ? t("manualMomo.payerPhone") : t("payerPhone")}
          hint={manualTransfer ? t("manualMomo.payerPhoneHint") : t("payerPhoneHint")}
          required
        >
          <Input
            id="payerPhone"
            name="payerPhone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            defaultValue={defaultPhone}
            required
          />
        </Field>
      ) : null}
      {method === "BANK_TRANSFER" ? (
        <p className="text-sm text-sand-700">{t("bankTransferNotice")}</p>
      ) : null}
      <Button type="submit" size="lg" loading={pending} className="w-full sm:w-auto">
        {manualTransfer ? t("manualMomo.submit") : t("payNow")}
      </Button>
    </ActionForm>
  );
}

function ManualTransferInstructions({
  method,
  amount,
  accounts,
}: {
  method: "MTN_MOBILE_MONEY" | "ORANGE_MONEY";
  amount: string;
  accounts: ManualMobileMoneyAccounts;
}) {
  const t = useTranslations("payments.manualMomo");
  const number = method === "MTN_MOBILE_MONEY" ? accounts.mtnNumber : accounts.orangeNumber;
  return (
    <div className="space-y-3 rounded-lg border border-brand-200 bg-brand-50 p-4 text-sm text-sand-800">
      <p className="font-semibold text-sand-900">{t("title")}</p>
      <ol className="list-decimal space-y-2 pl-5">
        <li>
          {t("step1", {
            amount,
            ussd: method === "MTN_MOBILE_MONEY" ? "*126#" : "#150#",
          })}
          <dl className="mt-2 grid gap-1 rounded-md bg-white px-3 py-2">
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-sand-600">{t("number")}</dt>
              <dd className="font-mono text-base font-semibold select-all">{number}</dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-sand-600">{t("accountName")}</dt>
              <dd className="font-semibold">{accounts.accountName}</dd>
            </div>
          </dl>
        </li>
        <li>{t("step2")}</li>
        <li>{t("step3")}</li>
      </ol>
    </div>
  );
}

/** Lets the customer correct the transaction ID of a transfer they already announced. */
export function CorrectTransactionIdForm({
  bookingId,
  method,
  defaultPhone,
}: {
  bookingId: string;
  method: "MTN_MOBILE_MONEY" | "ORANGE_MONEY";
  defaultPhone: string;
}) {
  const t = useTranslations("payments");
  const router = useRouter();
  const [state, action, pending] = useActionState(
    async (prev: PaymentActionResult, fd: FormData) => {
      const r = await initiatePaymentAction(prev, fd);
      if (r.ok) router.refresh();
      return r;
    },
    initial,
  );
  return (
    <details className="rounded-lg border border-sand-200 px-4 py-3 text-sm">
      <summary className="cursor-pointer font-medium text-sand-800">
        {t("manualMomo.correct")}
      </summary>
      <ActionForm action={action} state={state} className="mt-3 space-y-3">
        <input type="hidden" name="bookingId" value={bookingId} />
        <input type="hidden" name="method" value={method} />
        {!state.ok && state.message ? (
          <Alert tone="danger">
            {t.has(`errors.${state.message}` as "errors.INVALID")
              ? t(`errors.${state.message}` as "errors.INVALID")
              : state.message}
          </Alert>
        ) : null}
        {state.ok ? <Alert tone="success">{t("manualMomo.corrected")}</Alert> : null}
        <Field id="correctTransactionId" label={t("manualMomo.transactionId")} required>
          <Input
            id="correctTransactionId"
            name="transactionId"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={64}
            required
          />
        </Field>
        <Field id="correctPayerPhone" label={t("manualMomo.payerPhone")} required>
          <Input
            id="correctPayerPhone"
            name="payerPhone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            defaultValue={defaultPhone}
            required
          />
        </Field>
        <Button type="submit" variant="outline" loading={pending}>
          {t("manualMomo.correctSubmit")}
        </Button>
      </ActionForm>
    </details>
  );
}

export function PaymentStatusPanel({
  paymentId,
  status,
  instruction,
  isMock,
}: {
  paymentId: string;
  status: string;
  instruction: string | null;
  isMock: boolean;
}) {
  const t = useTranslations("payments");
  const router = useRouter();
  const [state, check, checking] = useActionState(checkPaymentStatusAction, initial);
  const [mockState, simulate, simulating] = useActionState(
    async (prev: PaymentActionResult, fd: FormData) => {
      const r = await simulateMockPaymentAction(prev, fd);
      router.refresh();
      return r;
    },
    initial,
  );
  const open = OPEN.includes(status);

  // Poll the server-side status (which polls the provider) while the request is open.
  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => {
      const fd = new FormData();
      fd.set("paymentId", paymentId);
      void checkPaymentStatusAction(initial, fd).then((r) => {
        if (r.status && r.status !== status) router.refresh();
      });
    }, 6000);
    return () => window.clearInterval(id);
  }, [open, paymentId, status, router]);

  useEffect(() => {
    if (state.status && state.status !== status) router.refresh();
  }, [state.status, status, router]);

  return (
    <div className="space-y-3">
      {instruction ? <p className="text-sm text-sand-800">{instruction}</p> : null}
      {open ? (
        <ActionForm action={check} state={state}>
          <input type="hidden" name="paymentId" value={paymentId} />
          <Button type="submit" variant="outline" loading={checking}>
            {t("checkStatus")}
          </Button>
        </ActionForm>
      ) : null}
      {isMock && open ? (
        <ActionForm
          action={simulate}
          state={mockState}
          className="space-y-2 rounded-lg border border-dashed border-accent-500 p-3"
        >
          <p className="text-xs font-semibold text-accent-700">{t("mockControls")}</p>
          <input type="hidden" name="paymentId" value={paymentId} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" name="outcome" value="approve" size="sm" loading={simulating}>
              {t("mockApprove")}
            </Button>
            <Button
              type="submit"
              name="outcome"
              value="decline"
              size="sm"
              variant="danger"
              loading={simulating}
            >
              {t("mockDecline")}
            </Button>
          </div>
          {mockState.message && !mockState.ok ? (
            <p className="text-xs text-danger-700">{mockState.message}</p>
          ) : null}
        </ActionForm>
      ) : null}
    </div>
  );
}
