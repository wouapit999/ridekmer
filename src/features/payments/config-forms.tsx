"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";

import { Alert, Badge } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { updateSetting, type AdminActionResult } from "@/features/admin/actions";

import {
  saveProviderConfigAction,
  validateProviderAction,
  type ProviderConfigActionResult,
} from "./config-actions";

const initial: ProviderConfigActionResult = { ok: false };

export interface ProviderView {
  key: "MTN_MOMO" | "ORANGE_MONEY" | "CARD";
  webhookUrl: string;
  enabled: boolean;
  environment: "mock" | "sandbox" | "production";
  baseUrl: string;
  cardProviderId: string;
  source: "database" | "environment";
  fields: Array<{ name: string; set: boolean; fromDatabase: boolean }>;
  validation: { ok: boolean; code: string; detail?: string };
  lastValidatedAt: string | null;
  lastValidationResult: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
  productionApp: boolean;
}

export function ProviderConfigCard({ view }: { view: ProviderView }) {
  const t = useTranslations("admin.settings.payments");
  const [state, action, pending] = useActionState(saveProviderConfigAction, initial);
  const [validation, validate, validating] = useActionState(validateProviderAction, initial);
  const [environment, setEnvironment] = useState(view.environment);
  const tone = !view.enabled
    ? "neutral"
    : view.validation.ok
      ? view.environment === "mock"
        ? "warn"
        : "good"
      : "danger";
  return (
    <section className="space-y-4 rounded-xl border border-sand-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">{t(`providers.${view.key}`)}</h3>
        <div className="flex flex-wrap gap-2">
          <Badge tone={tone}>{t(`validation.${view.validation.code}`)}</Badge>
          <Badge tone={view.source === "database" ? "brand" : "neutral"}>
            {t(`source.${view.source}`)}
          </Badge>
        </div>
      </div>
      <p className="text-xs text-sand-600">
        {t("webhookUrl")}: <code className="font-mono">{view.webhookUrl}</code>
      </p>
      {view.updatedAt ? (
        <p className="text-xs text-sand-500">
          {t("updatedBy", { name: view.updatedBy ?? "—", date: view.updatedAt })}
        </p>
      ) : null}
      {state.message ? (
        <Alert tone={state.ok ? "success" : "danger"}>
          {t(`result.${state.message}` as "result.SAVED")}
        </Alert>
      ) : null}
      <form action={action} className="grid gap-4 sm:grid-cols-2">
        <input type="hidden" name="provider" value={view.key} />
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <Checkbox name="enabled" value="true" defaultChecked={view.enabled} />
          {t("enabled")}
        </label>
        <Field
          id={`${view.key}-env`}
          label={t("environment")}
          hint={view.productionApp ? t("mockForbidden") : t("mockHint")}
        >
          <Select
            id={`${view.key}-env`}
            name="environment"
            defaultValue={view.environment}
            onChange={(e) => setEnvironment(e.target.value as ProviderView["environment"])}
          >
            <option value="mock" disabled={view.productionApp}>
              {t("environments.mock")}
            </option>
            <option value="sandbox">{t("environments.sandbox")}</option>
            <option value="production">{t("environments.production")}</option>
          </Select>
        </Field>
        <Field id={`${view.key}-base`} label={t("baseUrl")} hint={t("baseUrlHint")}>
          <Input
            id={`${view.key}-base`}
            name="baseUrl"
            type="url"
            defaultValue={view.baseUrl}
            placeholder="https://"
          />
        </Field>
        {view.key === "CARD" ? (
          <Field id="card-psp" label={t("cardProviderId")} hint={t("cardProviderIdHint")}>
            <Input
              id="card-psp"
              name="cardProviderId"
              defaultValue={view.cardProviderId}
              pattern="[a-z0-9-]*"
            />
          </Field>
        ) : null}
        <fieldset className="space-y-3 sm:col-span-2">
          <legend className="text-sm font-medium text-sand-800">{t("credentials")}</legend>
          <p className="text-xs text-sand-600">
            {environment === "mock" ? t("credentialsMock") : t("credentialsHint")}
          </p>
          {view.fields.map((f) => (
            <div key={f.name} className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
              <Field
                id={`${view.key}-${f.name}`}
                label={
                  <>
                    <code className="font-mono text-xs">{f.name}</code>{" "}
                    <Badge tone={f.set ? "good" : "neutral"}>
                      {f.set
                        ? f.fromDatabase
                          ? t("setDatabase")
                          : t("setEnvironment")
                        : t("notSet")}
                    </Badge>
                  </>
                }
              >
                <Input
                  id={`${view.key}-${f.name}`}
                  name={`cred:${f.name}`}
                  type="password"
                  autoComplete="off"
                  placeholder={f.set ? "••••••••" : ""}
                />
              </Field>
              {f.fromDatabase ? (
                <label className="flex items-center gap-2 pb-2 text-xs text-sand-700">
                  <Checkbox name={`clear:${f.name}`} value="1" />
                  {t("clear")}
                </label>
              ) : null}
            </div>
          ))}
        </fieldset>
        <div className="sm:col-span-2">
          <Button type="submit" loading={pending}>
            {t("save")}
          </Button>
        </div>
      </form>
      <form
        action={validate}
        className="flex flex-wrap items-center gap-3 border-t border-sand-200 pt-3"
      >
        <input type="hidden" name="provider" value={view.key} />
        <Button type="submit" variant="outline" size="sm" loading={validating}>
          {t("validate")}
        </Button>
        {validation.message ? (
          <span className={validation.ok ? "text-sm text-success-600" : "text-sm text-danger-700"}>
            {t(`validation.${validation.message}` as "validation.OK_MOCK")}
            {validation.detail ? ` — ${validation.detail}` : ""}
          </span>
        ) : view.lastValidationResult ? (
          <span className="text-xs text-sand-600">
            {t("lastValidation", { date: view.lastValidatedAt ?? "" })}: {view.lastValidationResult}
          </span>
        ) : null}
      </form>
    </section>
  );
}

export function TypedSettingField({
  settingKey,
  value,
  valueType,
  label,
  description,
}: {
  settingKey: string;
  value: string;
  valueType: string;
  label: string;
  description: string;
}) {
  const t = useTranslations("admin.settings");
  const [state, action, pending] = useActionState(updateSetting, {
    ok: false,
  } as AdminActionResult);
  const id = `ps-${settingKey}`;
  return (
    <form
      action={action}
      className="grid gap-2 rounded-lg border border-sand-200 bg-white p-4 sm:grid-cols-[1fr_auto] sm:items-end"
    >
      <input type="hidden" name="key" value={settingKey} />
      <Field id={id} label={label} hint={description}>
        {valueType === "BOOLEAN" ? (
          <Select id={id} name="value" defaultValue={value}>
            <option value="true">{t("enabledValue")}</option>
            <option value="false">{t("disabledValue")}</option>
          </Select>
        ) : valueType === "INTEGER" ? (
          <Input id={id} name="value" type="number" step={1} min={0} defaultValue={value} />
        ) : value.length > 60 ? (
          <Textarea id={id} name="value" defaultValue={value} className="min-h-20" />
        ) : (
          <Input id={id} name="value" defaultValue={value} />
        )}
      </Field>
      <div className="flex items-center gap-2 pb-0.5">
        <Button type="submit" variant="outline" size="sm" loading={pending}>
          {t("update")}
        </Button>
        {state.ok ? <span className="text-xs text-success-600">{t("settingSaved")}</span> : null}
        {!state.ok && state.message === "invalid" ? (
          <span className="text-xs text-danger-700">{valueType}</span>
        ) : null}
      </div>
    </form>
  );
}
