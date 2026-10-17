"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { ActionForm } from "@/components/ui/action-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Textarea } from "@/components/ui/field";

import type { ActionResult } from "./actions";
import { cancelDeletionAction, requestDeletionAction } from "./privacy-actions";

const initial: ActionResult = { ok: false };

function messageFor(t: ReturnType<typeof useTranslations>, state: ActionResult) {
  if (!state.message) return null;
  const map: Record<string, string> = {
    requested: "requested",
    cancelled: "cancelled",
    ACTIVE_BOOKINGS: "errorActiveBookings",
    OUTSTANDING_BALANCE: "errorBalance",
    STAFF: "errorStaff",
    rateLimited: "errorRateLimited",
  };
  return t(map[state.message] ?? "errorGeneric");
}

export function DeletionRequestForm({ graceDays }: { graceDays: number }) {
  const t = useTranslations("account.privacy");
  const [state, action, pending] = useActionState(requestDeletionAction, initial);
  const message = messageFor(t, state);
  return (
    <ActionForm action={action} state={state} className="space-y-4">
      <p className="text-sm text-sand-700">{t("deleteBody", { days: graceDays })}</p>
      {message ? <Alert tone={state.ok ? "success" : "danger"}>{message}</Alert> : null}
      {!state.ok ? (
        <>
          <Field id="reason" label={t("deleteReason")}>
            <Textarea id="reason" name="reason" rows={3} maxLength={500} />
          </Field>
          <div className="flex items-start gap-2">
            <Checkbox id="confirm" name="confirm" required />
            <label htmlFor="confirm" className="text-sm text-sand-800">
              {t("deleteConfirm")}
            </label>
          </div>
          <Button type="submit" variant="danger" disabled={pending}>
            {t("deleteButton")}
          </Button>
        </>
      ) : null}
    </ActionForm>
  );
}

export function CancelDeletionForm({ requestedAt }: { requestedAt: string }) {
  const t = useTranslations("account.privacy");
  const [state, action, pending] = useActionState(cancelDeletionAction, initial);
  const message = messageFor(t, state);
  return (
    <ActionForm action={action} state={state} className="space-y-4">
      <p className="text-sm text-sand-700">{t("pendingBody", { date: requestedAt })}</p>
      {message ? <Alert tone={state.ok ? "success" : "danger"}>{message}</Alert> : null}
      {!state.ok ? (
        <Button type="submit" variant="outline" disabled={pending}>
          {t("cancelButton")}
        </Button>
      ) : null}
    </ActionForm>
  );
}
