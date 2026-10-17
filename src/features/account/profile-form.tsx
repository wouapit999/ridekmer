"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { ActionForm } from "@/components/ui/action-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";

import { updateProfile, type ActionResult } from "./actions";

export function ProfileForm({
  user,
}: {
  user: { name: string; email: string; phoneNumber: string | null; preferredLocale: string };
}) {
  const t = useTranslations("account.profile");
  const [state, action, pending] = useActionState(updateProfile, { ok: false } as ActionResult);
  return (
    <ActionForm action={action} state={state} className="max-w-lg space-y-4">
      {state.ok ? <Alert tone="success">{t("saved")}</Alert> : null}
      <Field id="name" label={t("name")} required>
        <Input id="name" name="name" defaultValue={user.name} required minLength={2} />
      </Field>
      <Field id="email" label={t("email")}>
        <Input id="email" value={user.email} readOnly disabled />
      </Field>
      <Field id="phone" label={t("phone")}>
        <Input id="phone" value={user.phoneNumber ?? "—"} readOnly disabled />
      </Field>
      <Field id="preferredLocale" label={t("locale")}>
        <Select id="preferredLocale" name="preferredLocale" defaultValue={user.preferredLocale}>
          <option value="fr">Français</option>
          <option value="en">English</option>
        </Select>
      </Field>
      <Button type="submit" loading={pending}>
        {t("save")}
      </Button>
    </ActionForm>
  );
}
