"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { ActionForm } from "@/components/ui/action-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Select, Textarea } from "@/components/ui/field";

import {
  acceptContractAction,
  publishTemplateVersionAction,
  type ContractActionResult,
} from "./actions";

const initial: ContractActionResult = { ok: false };

export function AcceptContractForm({ contractId }: { contractId: string }) {
  const t = useTranslations("contracts");
  const [state, action, pending] = useActionState(acceptContractAction, initial);
  if (state.ok) return <Alert tone="success">{t("accepted")}</Alert>;
  return (
    <ActionForm
      action={action}
      state={state}
      className="space-y-3 rounded-xl border border-sand-200 bg-white p-5"
    >
      <input type="hidden" name="contractId" value={contractId} />
      {state.message ? (
        <Alert tone="danger">
          {t.has(`errors.${state.message}` as "errors.INVALID_STATUS")
            ? t(`errors.${state.message}` as "errors.INVALID_STATUS")
            : state.message}
        </Alert>
      ) : null}
      <label className="flex items-start gap-2 text-sm">
        <Checkbox name="accept" value="1" className="mt-0.5" />
        <span>{t("acceptLabel")}</span>
      </label>
      <p className="text-xs text-sand-600">{t("evidenceNotice")}</p>
      <Button type="submit" loading={pending} size="lg">
        {t("acceptButton")}
      </Button>
    </ActionForm>
  );
}

export function PublishTemplateForm({
  templates,
}: {
  templates: Array<{ key: string; name: string }>;
}) {
  const t = useTranslations("contracts.admin");
  const [state, action, pending] = useActionState(publishTemplateVersionAction, initial);
  return (
    <ActionForm
      action={action}
      state={state}
      className="space-y-3 rounded-xl border border-sand-200 bg-white p-5"
    >
      <h2 className="text-lg font-semibold">{t("publish")}</h2>
      <p className="text-xs text-sand-600">{t("publishHint")}</p>
      {state.message ? (
        <Alert tone={state.ok ? "success" : "danger"}>
          {t(`result.${state.message}` as "result.PUBLISHED")}
        </Alert>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="tpl-key" label={t("template")} required>
          <Select id="tpl-key" name="templateKey" required>
            {templates.map((tpl) => (
              <option key={tpl.key} value={tpl.key}>
                {tpl.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="tpl-locale" label={t("locale")} required>
          <Select id="tpl-locale" name="locale" required>
            <option value="fr">Français</option>
            <option value="en">English</option>
          </Select>
        </Field>
      </div>
      <Field id="tpl-body" label={t("body")} required hint={t("bodyHint")}>
        <Textarea
          id="tpl-body"
          name="bodyMarkdown"
          required
          minLength={50}
          className="min-h-64 font-mono text-xs"
        />
      </Field>
      <Button type="submit" loading={pending}>
        {t("publishButton")}
      </Button>
    </ActionForm>
  );
}
