"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { ActionForm } from "@/components/ui/action-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { enumLabel } from "@/lib/i18n-enum";

import { addCity, updateSetting, type AdminActionResult } from "./actions";

export function CityForm() {
  const t = useTranslations("admin.settings");
  const [state, action, pending] = useActionState(addCity, { ok: false } as AdminActionResult);
  return (
    <ActionForm
      action={action}
      state={state}
      className="grid gap-4 rounded-xl border border-sand-200 bg-white p-5 sm:grid-cols-2"
    >
      <h3 className="text-lg font-semibold sm:col-span-2">{t("addCity")}</h3>
      {state.ok ? (
        <div className="sm:col-span-2">
          <Alert tone="success">{t("cityAdded")}</Alert>
        </div>
      ) : null}
      <Field id="slug" label={t("slug")} required>
        <Input id="slug" name="slug" pattern="[a-z0-9-]{2,40}" required />
      </Field>
      <Field id="region" label={t("region")}>
        <Input id="region" name="region" />
      </Field>
      <Field id="nameFr" label={t("nameFr")} required>
        <Input id="nameFr" name="nameFr" required />
      </Field>
      <Field id="nameEn" label={t("nameEn")} required>
        <Input id="nameEn" name="nameEn" required />
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" loading={pending}>
          {t("addCity")}
        </Button>
      </div>
    </ActionForm>
  );
}

export function SettingRow({
  settingKey,
  value,
  valueType,
  description,
}: {
  settingKey: string;
  value: string;
  valueType: string;
  description: string;
}) {
  const t = useTranslations("admin.settings");
  const te = useTranslations("enums");
  const [state, action, pending] = useActionState(updateSetting, {
    ok: false,
  } as AdminActionResult);
  return (
    <tr>
      <td className="px-4 py-3 align-top font-mono text-xs">{settingKey}</td>
      <td className="px-4 py-3 align-top text-sand-700">{description}</td>
      <td className="px-4 py-3 align-top">
        <ActionForm action={action} state={state} className="flex items-start gap-2">
          <input type="hidden" name="key" value={settingKey} />
          <label htmlFor={`setting-${settingKey}`} className="sr-only">
            {t("value")}
          </label>
          <Input
            id={`setting-${settingKey}`}
            name="value"
            defaultValue={value}
            className="min-w-32 font-mono text-xs"
            aria-describedby={`setting-${settingKey}-type`}
          />
          <span id={`setting-${settingKey}-type`} className="sr-only">
            {enumLabel(te, "settingValueType", valueType)}
          </span>
          <Button type="submit" variant="outline" size="sm" loading={pending}>
            {t("update")}
          </Button>
        </ActionForm>
        {state.ok ? <p className="mt-1 text-xs text-success-600">{t("settingSaved")}</p> : null}
        {!state.ok && state.message === "invalid" ? (
          <p className="mt-1 text-xs text-danger-700">
            {t("expectedType", { type: enumLabel(te, "settingValueType", valueType) })}
          </p>
        ) : null}
      </td>
    </tr>
  );
}
