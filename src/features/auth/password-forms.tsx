"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Link } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";

export function ForgotPasswordForm() {
  const t = useTranslations("auth.forgot");
  const locale = useLocale();
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const form = new FormData(event.currentTarget);
    await authClient.requestPasswordReset({
      email: String(form.get("email") ?? ""),
      redirectTo: `/${locale}/reset-password`,
    });
    setPending(false);
    setSent(true); // same response whether or not the account exists
  }

  if (sent) return <Alert tone="success">{t("sent")}</Alert>;
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field id="email" label={t("email")} required>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Button type="submit" className="w-full" loading={pending}>
        {t("submit")}
      </Button>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token?: string }) {
  const t = useTranslations("auth.reset");
  const tv = useTranslations("validation");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  if (!token) return <Alert tone="danger">{t("invalidToken")}</Alert>;
  if (done)
    return (
      <Alert tone="success">
        {t("success")}{" "}
        <Link href="/login" className="font-medium underline">
          →
        </Link>
      </Alert>
    );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    if (password.length < 10) return setError(tv("passwordMin", { min: 10 }));
    if (password !== String(form.get("confirm") ?? "")) return setError(t("mismatch"));
    setPending(true);
    const { error: err } = await authClient.resetPassword({ newPassword: password, token: token! });
    setPending(false);
    if (err) return setError(t("invalidToken"));
    setDone(true);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field id="password" label={t("password")} required>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
        />
      </Field>
      <Field id="confirm" label={t("confirm")} required>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </Field>
      <Button type="submit" className="w-full" loading={pending}>
        {t("submit")}
      </Button>
    </form>
  );
}
