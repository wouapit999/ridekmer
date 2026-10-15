"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";

import { submitContact, type ContactState } from "./actions";

const initial: ContactState = { ok: false };

export function ContactForm({ defaultCategory }: { defaultCategory?: string }) {
  const t = useTranslations("contact.form");
  const tv = useTranslations("validation");
  const tErrors = useTranslations("errors");
  const [state, action, pending] = useActionState(submitContact, initial);

  if (state.ok && state.reference) {
    return <Alert tone="success">{t("success", { reference: state.reference })}</Alert>;
  }

  const err = (key: keyof NonNullable<ContactState["errors"]>) =>
    state.errors?.[key] ? tv("required") : null;

  return (
    <form action={action} className="space-y-5" noValidate>
      {state.failed ? (
        <Alert tone="danger">{state.rateLimited ? tErrors("rateLimited") : t("error")}</Alert>
      ) : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="name" label={t("name")} required error={err("name")}>
          <Input
            id="name"
            name="name"
            autoComplete="name"
            required
            aria-invalid={!!state.errors?.name}
          />
        </Field>
        <Field
          id="email"
          label={t("email")}
          required
          error={state.errors?.email ? tv("email") : null}
        >
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            aria-invalid={!!state.errors?.email}
          />
        </Field>
        <Field id="phone" label={t("phone")} optionalLabel="" error={null}>
          <Input id="phone" name="phone" type="tel" autoComplete="tel" inputMode="tel" />
        </Field>
        <Field id="category" label={t("category")} required>
          <Select id="category" name="category" defaultValue={defaultCategory ?? "booking"}>
            {(["booking", "owner", "corporate", "incident", "other"] as const).map((c) => (
              <option key={c} value={c}>
                {t(`categories.${c}`)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field
        id="message"
        label={t("message")}
        required
        error={state.errors?.message ? tv("minLength", { min: 10 }) : null}
      >
        <Textarea
          id="message"
          name="message"
          required
          minLength={10}
          maxLength={4000}
          aria-invalid={!!state.errors?.message}
        />
      </Field>
      <div className="hidden" aria-hidden="true">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <Button type="submit" loading={pending}>
        {t("submit")}
      </Button>
    </form>
  );
}
