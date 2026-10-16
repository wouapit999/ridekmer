"use client";

import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Link, useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { parsePhone } from "@/lib/phone";

export function LoginForm({ returnTo, smsIsMock }: { returnTo?: string; smsIsMock: boolean }) {
  const t = useTranslations("auth.login");
  const tp = useTranslations("auth.phone");
  const router = useRouter();
  const [mode, setMode] = useState<"email" | "phone">("email");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [otpSentTo, setOtpSentTo] = useState<string | null>(null);

  const destination = returnTo && returnTo.startsWith("/") ? returnTo : "/account";

  async function onEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(event.currentTarget);
    const { data, error: err } = await authClient.signIn.email({
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    });
    setPending(false);
    if (err) {
      // Unknown failures carry the server's reason (status + message) so a configuration
      // problem is visible to the tester instead of a generic message.
      const reason = [err.status, err.message].filter(Boolean).join(" ");
      setError(
        err.code === "INVALID_EMAIL_OR_PASSWORD"
          ? t("errorInvalid")
          : err.code === "FAILED_TO_CREATE_SESSION"
            ? t("errorSuspended")
            : err.status === 429
              ? t("errorRateLimited")
              : reason
                ? `${t("errorGeneric")} (${reason})`
                : t("errorGeneric"),
      );
      return;
    }
    if ((data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect) return; // handled by plugin callback
    router.push(destination);
    router.refresh();
  }

  async function onSendOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const parsed = parsePhone(String(form.get("phone") ?? ""));
    if (!parsed) {
      setError(tp("errorInvalidPhone"));
      return;
    }
    setPending(true);
    const { error: err } = await authClient.phoneNumber.sendOtp({ phoneNumber: parsed.e164 });
    setPending(false);
    if (err) {
      setError(err.status === 429 ? t("errorRateLimited") : t("errorGeneric"));
      return;
    }
    setOtpSentTo(parsed.e164);
  }

  async function onVerifyOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!otpSentTo) return;
    setError(null);
    setPending(true);
    const form = new FormData(event.currentTarget);
    const { error: err } = await authClient.phoneNumber.verify({
      phoneNumber: otpSentTo,
      code: String(form.get("code") ?? ""),
    });
    setPending(false);
    if (err) {
      setError(tp("errorInvalidCode"));
      return;
    }
    router.push(destination);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {mode === "email" ? (
        <form onSubmit={onEmailSubmit} className="space-y-4">
          <Field id="email" label={t("email")} required>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </Field>
          <Field id="password" label={t("password")} required>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </Field>
          <Button type="submit" className="w-full" loading={pending}>
            {t("submit")}
          </Button>
          <p className="text-center text-sm">
            <Link href="/forgot-password" className="text-brand-700 hover:underline">
              {t("forgot")}
            </Link>
          </p>
        </form>
      ) : otpSentTo ? (
        <form onSubmit={onVerifyOtp} className="space-y-4">
          <Alert tone="info">{tp("sent", { phone: otpSentTo })}</Alert>
          {smsIsMock ? <Alert tone="warning">{tp("devHint")}</Alert> : null}
          <Field id="code" label={tp("code")} required>
            <Input
              id="code"
              name="code"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              autoComplete="one-time-code"
              required
            />
          </Field>
          <Button type="submit" className="w-full" loading={pending}>
            {tp("verify")}
          </Button>
          <button
            type="button"
            className="w-full text-sm text-brand-700 hover:underline"
            onClick={() => setOtpSentTo(null)}
          >
            {tp("resend")}
          </button>
        </form>
      ) : (
        <form onSubmit={onSendOtp} className="space-y-4">
          <Field id="phone" label={tp("phone")} hint={tp("phoneHint")} required>
            <Input
              id="phone"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="6XX XXX XXX"
              required
            />
          </Field>
          <Button type="submit" className="w-full" loading={pending}>
            {tp("sendCode")}
          </Button>
        </form>
      )}
      <button
        type="button"
        className="min-h-11 w-full rounded-md border border-sand-300 px-4 py-2.5 text-sm font-medium text-sand-800 hover:bg-sand-100"
        onClick={() => {
          setMode(mode === "email" ? "phone" : "email");
          setError(null);
          setOtpSentTo(null);
        }}
      >
        {mode === "email" ? t("withPhone") : t("withEmail")}
      </button>
      <p className="text-center text-sm text-sand-700">
        {t("noAccount")}{" "}
        <Link href="/register" className="font-medium text-brand-700 hover:underline">
          {t("register")}
        </Link>
      </p>
    </div>
  );
}
