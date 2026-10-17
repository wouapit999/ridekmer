"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { ActionForm } from "@/components/ui/action-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/field";

import { staffBookingTransitionAction, type BookingActionResult } from "./actions";
import { BOOKING_TRANSITIONS, STAFF_TRANSITIONS } from "./state-machine";

import type { BookingStatus } from "@/generated/prisma/enums";

export function StaffTransitionForm({
  bookingId,
  status,
  permissions,
  extensionUntil,
}: {
  bookingId: string;
  status: BookingStatus;
  permissions: string[];
  extensionUntil?: string;
}) {
  const t = useTranslations("admin.bookings");
  const [state, action, pending] = useActionState(staffBookingTransitionAction, {
    ok: false,
  } as BookingActionResult);
  const available = STAFF_TRANSITIONS.filter(
    (rule) =>
      BOOKING_TRANSITIONS[status].includes(rule.to) && permissions.includes(rule.permission),
  );
  const canOverride = permissions.includes("booking.override");
  if (available.length === 0 && !(status === "EXTENSION_REQUESTED" && canOverride)) return null;
  const variant = (to: BookingStatus): "primary" | "danger" | "outline" =>
    to === "CANCELLED" || to === "NO_SHOW" || to === "DISPUTED"
      ? "danger"
      : to === "CONFIRMED"
        ? "outline"
        : "primary";
  return (
    <ActionForm
      action={action}
      state={state}
      className="space-y-3 rounded-xl border border-sand-200 bg-white p-5"
    >
      <h2 className="text-lg font-semibold">{t("transitions")}</h2>
      <input type="hidden" name="bookingId" value={bookingId} />
      {state.message ? (
        <Alert tone={state.ok ? "success" : "danger"}>
          {t.has(`result.${state.message}` as "result.ACTIVE")
            ? t(`result.${state.message}` as "result.ACTIVE")
            : state.message}
        </Alert>
      ) : null}
      {status === "EXTENSION_REQUESTED" && canOverride ? (
        <div className="space-y-2 rounded-md bg-accent-50 p-3 text-sm">
          <p>{t("extensionRequest", { date: extensionUntil ?? "" })}</p>
          <div className="flex gap-2">
            <Button type="submit" name="extension" value="APPROVE" size="sm" loading={pending}>
              {t("approveExtension")}
            </Button>
            <Button
              type="submit"
              name="extension"
              value="DECLINE"
              size="sm"
              variant="outline"
              loading={pending}
            >
              {t("declineExtension")}
            </Button>
          </div>
        </div>
      ) : null}
      <Field id="transitionReason" label={t("reason")}>
        <Input id="transitionReason" name="reason" maxLength={500} />
      </Field>
      {canOverride &&
      (status === "CONFIRMED" || status === "READY_FOR_PICKUP" || status === "ACTIVE") ? (
        <label className="flex items-center gap-2 text-xs text-sand-700">
          <Checkbox name="override" value="1" />
          {t("overrideGates")}
        </label>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {available.map((rule) => (
          <Button
            key={rule.to}
            type="submit"
            name="to"
            value={rule.to}
            variant={variant(rule.to)}
            loading={pending}
          >
            {t(`actions.${rule.to}` as "actions.ACTIVE")}
          </Button>
        ))}
      </div>
    </ActionForm>
  );
}
