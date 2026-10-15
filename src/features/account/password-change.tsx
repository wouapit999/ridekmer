"use client";

import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { authClient } from "@/lib/auth-client";

export function PasswordChange() {
  const t = useTranslations("account.security");
  const tv = useTranslations("validation");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setDone(false);
    const form = new FormData(event.currentTarget);
    const newPassword = String(form.get("newPassword") ?? "");
    if (newPassword.length < 10) return setError(tv("passwordMin", { min: 10 }));
    setPending(true);
    const { error: err } = await authClient.changePassword({
      currentPassword: String(form.get("currentPassword") ?? ""),
      newPassword,
      revokeOtherSessions: true,
    });
    setPending(false);
    if (err) return setError(t("errorPassword"));
    setDone(true);
    event.currentTarget.reset();
  }

  return (
    <section className="space-y-4 rounded-xl border border-sand-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-sand-900">{t("passwordTitle")}</h2>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {done ? <Alert tone="success">{t("passwordChanged")}</Alert> : null}
      <form onSubmit={onSubmit} className="space-y-3">
        <Field id="currentPassword" label={t("currentPassword")} required>
          <Input
            id="currentPassword"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
          />
        </Field>
        <Field id="newPassword" label={t("newPassword")} required>
          <Input
            id="newPassword"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
          />
        </Field>
        <Button type="submit" loading={pending}>
          {t("changePassword")}
        </Button>
      </form>
      <Button
        type="button"
        variant="outline"
        onClick={async () => {
          await authClient.revokeOtherSessions();
        }}
      >
        {t("revokeOthers")}
      </Button>
    </section>
  );
}
