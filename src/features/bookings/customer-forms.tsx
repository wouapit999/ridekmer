"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { ActionForm } from "@/components/ui/action-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/field";
import { Link, useRouter } from "@/i18n/navigation";

import {
  cancelBookingAction,
  confirmBookingAction,
  requestExtensionAction,
  type BookingActionResult,
} from "./actions";

const initial: BookingActionResult = { ok: false };

function useAvailabilityError() {
  const t = useTranslations("cars.availabilityErrors");
  const tb = useTranslations("bookings.errors");
  return (code?: string, vars?: Record<string, string | number>) => {
    if (!code) return null;
    if (t.has(code as "UNAVAILABLE")) return t(code as "UNAVAILABLE", vars);
    if (tb.has(code as "INVALID_STATUS")) return tb(code as "INVALID_STATUS");
    return code;
  };
}

export function ConfirmBookingForm({
  fields,
  minAdvanceHours,
  holdUntil,
}: {
  fields: Record<string, string>;
  minAdvanceHours: number;
  holdUntil?: string;
}) {
  const t = useTranslations("checkout");
  const router = useRouter();
  const err = useAvailabilityError();
  const [state, action, pending] = useActionState(
    async (prev: BookingActionResult, fd: FormData) => {
      const r = await confirmBookingAction(prev, fd);
      if (r.ok && r.bookingId) router.push(`/account/bookings/${r.bookingId}`);
      return r;
    },
    initial,
  );
  return (
    <ActionForm action={action} state={state} className="space-y-4">
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {!state.ok && state.message ? (
        <Alert tone="danger">
          {state.message === "UNAUTHENTICATED"
            ? t("errors.UNAUTHENTICATED")
            : err(state.message, { hours: minAdvanceHours })}
        </Alert>
      ) : null}
      {state.errors?.accept ? <Alert tone="danger">{t("errors.accept")}</Alert> : null}
      <Field id="customerNotes" label={t("notes")}>
        <Textarea id="customerNotes" name="customerNotes" maxLength={1000} className="min-h-20" />
      </Field>
      <label className="flex items-start gap-2 text-sm text-sand-800">
        <Checkbox name="accept" value="1" className="mt-0.5" />
        <span>
          {t.rich("accept", {
            rental: (chunks) => (
              <Link href="/rental-policy" className="text-brand-700 underline" target="_blank">
                {chunks}
              </Link>
            ),
            cancellation: (chunks) => (
              <Link
                href="/cancellation-policy"
                className="text-brand-700 underline"
                target="_blank"
              >
                {chunks}
              </Link>
            ),
          })}
        </span>
      </label>
      {holdUntil ? (
        <p className="text-xs text-sand-600">{t("holdInfo", { time: holdUntil })}</p>
      ) : null}
      <Button type="submit" size="lg" loading={pending} className="w-full sm:w-auto">
        {t("confirm")}
      </Button>
    </ActionForm>
  );
}

export function CancelBookingForm({ bookingId }: { bookingId: string }) {
  const t = useTranslations("bookings.detail");
  const err = useAvailabilityError();
  const [state, action, pending] = useActionState(cancelBookingAction, initial);
  if (state.ok) return <Alert tone="success">{t("cancelled")}</Alert>;
  return (
    <ActionForm
      action={action}
      state={state}
      className="space-y-3 rounded-xl border border-sand-200 bg-white p-5"
    >
      <h2 className="font-semibold">{t("cancel")}</h2>
      <input type="hidden" name="bookingId" value={bookingId} />
      {state.message ? <Alert tone="danger">{err(state.message)}</Alert> : null}
      <Field
        id="cancelReason"
        label={t("cancelReason")}
        required
        error={state.errors?.reason ? t("cancelReason") : null}
      >
        <Input id="cancelReason" name="reason" required minLength={3} maxLength={500} />
      </Field>
      <Button type="submit" variant="danger" loading={pending}>
        {t("cancelConfirm")}
      </Button>
    </ActionForm>
  );
}

export function ExtensionForm({ bookingId, minDate }: { bookingId: string; minDate: string }) {
  const t = useTranslations("bookings.detail");
  const err = useAvailabilityError();
  const [state, action, pending] = useActionState(requestExtensionAction, initial);
  if (state.ok) return <Alert tone="success">{t("extensionRequested")}</Alert>;
  return (
    <ActionForm
      action={action}
      state={state}
      className="space-y-3 rounded-xl border border-sand-200 bg-white p-5"
    >
      <h2 className="font-semibold">{t("extension")}</h2>
      <input type="hidden" name="bookingId" value={bookingId} />
      {state.message ? <Alert tone="danger">{err(state.message)}</Alert> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="newEndDate" label={t("newEndDate")} required>
          <Input id="newEndDate" name="newEndDate" type="date" min={minDate} required />
        </Field>
        <Field id="newEndTime" label={t("newEndTime")} required>
          <Input id="newEndTime" name="newEndTime" type="time" defaultValue="09:00" required />
        </Field>
      </div>
      <Button type="submit" variant="outline" loading={pending}>
        {t("requestExtension")}
      </Button>
    </ActionForm>
  );
}
