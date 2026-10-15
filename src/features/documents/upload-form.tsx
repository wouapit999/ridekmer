"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";

export interface DocumentTypeOption {
  key: string;
  name: string;
  isMandatory: boolean;
  requiresExpiry: boolean;
  requiresNumber: boolean;
}

interface Result {
  ok: boolean;
  message?: string;
  errors?: Record<string, string>;
}

type Action = (prev: Result, formData: FormData) => Promise<Result>;

/** Generic document upload form used by owners (KYC + vehicle documents) and customers. */
export function DocumentUploadForm({
  action,
  types,
  hidden,
  maxMb = 10,
  lockType,
}: {
  action: Action;
  types: DocumentTypeOption[];
  hidden?: Record<string, string>;
  maxMb?: number;
  lockType?: string;
}) {
  const t = useTranslations("owner.documents");
  const te = useTranslations("owner.errors");
  const [state, formAction, pending] = useActionState(action, { ok: false } as Result);
  const prefix = lockType ?? "doc";
  return (
    <form
      action={formAction}
      className="grid gap-4 rounded-xl border border-sand-200 bg-white p-5 sm:grid-cols-2"
      encType="multipart/form-data"
    >
      {Object.entries(hidden ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {state.ok ? (
        <div className="sm:col-span-2">
          <Alert tone="success">{t("uploaded")}</Alert>
        </div>
      ) : null}
      {!state.ok && state.message ? (
        <div className="sm:col-span-2">
          <Alert tone="danger">
            {te.has(state.message as "NOT_FOUND")
              ? te(state.message as "NOT_FOUND")
              : state.message}
          </Alert>
        </div>
      ) : null}
      {lockType ? (
        <input type="hidden" name="typeKey" value={lockType} />
      ) : (
        <Field id={`${prefix}-typeKey`} label={t("type")} required className="sm:col-span-2">
          <Select id={`${prefix}-typeKey`} name="typeKey" required>
            {types.map((d) => (
              <option key={d.key} value={d.key}>
                {d.name}
                {d.isMandatory ? " *" : ""}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field
        id={`${prefix}-file`}
        label={t("file", { max: maxMb })}
        required
        error={state.errors?.file ? te("FILE_EMPTY") : null}
        className="sm:col-span-2"
      >
        <Input
          id={`${prefix}-file`}
          name="file"
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          required
          capture="environment"
        />
      </Field>
      <Field id={`${prefix}-documentNumber`} label={t("number")}>
        <Input id={`${prefix}-documentNumber`} name="documentNumber" autoComplete="off" />
      </Field>
      <Field id={`${prefix}-issuer`} label={t("issuer")}>
        <Input id={`${prefix}-issuer`} name="issuer" />
      </Field>
      <Field id={`${prefix}-issueDate`} label={t("issueDate")}>
        <Input id={`${prefix}-issueDate`} name="issueDate" type="date" />
      </Field>
      <Field id={`${prefix}-expiryDate`} label={t("expiryDate")}>
        <Input id={`${prefix}-expiryDate`} name="expiryDate" type="date" />
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" loading={pending}>
          {t("upload")}
        </Button>
      </div>
    </form>
  );
}
