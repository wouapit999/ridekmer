"use client";

import { useTranslations } from "next-intl";
import QRCode from "qrcode";
import { useState, type FormEvent } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";

type Stage = "idle" | "verify" | "done";

export function MfaSetup({ enabled, required }: { enabled: boolean; required: boolean }) {
  const t = useTranslations("account.security");
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("idle");
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onEnable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(event.currentTarget);
    const { data, error: err } = await authClient.twoFactor.enable({
      password: String(form.get("password") ?? ""),
      issuer: "RideKmer",
    });
    setPending(false);
    if (err || !data || data.method !== "totp") return setError(t("errorPassword"));
    setQr(await QRCode.toDataURL(data.totpURI, { margin: 1, width: 220 }));
    setSecret(new URL(data.totpURI).searchParams.get("secret"));
    setBackupCodes(data.backupCodes);
    setStage("verify");
  }

  async function onVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(event.currentTarget);
    const { error: err } = await authClient.twoFactor.verifyTotp({
      code: String(form.get("code") ?? "").replace(/\s/g, ""),
    });
    setPending(false);
    if (err) return setError(t("errorCode"));
    setStage("done");
    router.refresh();
  }

  async function onDisable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(event.currentTarget);
    const { error: err } = await authClient.twoFactor.disable({
      password: String(form.get("password") ?? ""),
    });
    setPending(false);
    if (err) return setError(t("errorPassword"));
    router.refresh();
  }

  return (
    <section className="space-y-4 rounded-xl border border-sand-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-sand-900">{t("mfaTitle")}</h2>
      {required && !enabled ? <Alert tone="warning">{t("mfaRequired")}</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {stage === "done" ? <Alert tone="success">{t("done")}</Alert> : null}

      {enabled && stage !== "done" ? (
        <form onSubmit={onDisable} className="space-y-3">
          <Alert tone="success">{t("mfaEnabled")}</Alert>
          <Field id="disable-password" label={t("password")} required>
            <Input
              id="disable-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </Field>
          <Button type="submit" variant="danger" loading={pending}>
            {t("disable")}
          </Button>
        </form>
      ) : null}

      {!enabled && stage === "idle" ? (
        <form onSubmit={onEnable} className="space-y-3">
          <p className="text-sm text-sand-700">{t("mfaDisabled")}</p>
          <Field id="enable-password" label={t("password")} required>
            <Input
              id="enable-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </Field>
          <Button type="submit" loading={pending}>
            {t("enable")}
          </Button>
        </form>
      ) : null}

      {stage === "verify" ? (
        <form onSubmit={onVerify} className="space-y-4">
          <p className="text-sm text-sand-700">{t("scan")}</p>
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element -- data URL generated client-side, no optimisation possible
            <img
              src={qr}
              alt="TOTP QR code"
              width={220}
              height={220}
              className="rounded-md border border-sand-200"
            />
          ) : null}
          {secret ? (
            <p className="text-sm">
              <span className="font-medium">{t("secret")}:</span>{" "}
              <code className="rounded bg-sand-100 px-1.5 py-0.5 font-mono text-xs break-all">
                {secret}
              </code>
            </p>
          ) : null}
          <Field id="code" label={t("enterCode")} required>
            <Input
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
            />
          </Field>
          <Button type="submit" loading={pending}>
            {t("enable")}
          </Button>
        </form>
      ) : null}

      {stage === "done" && backupCodes.length ? (
        <div>
          <p className="text-sm font-medium text-sand-800">{t("backupCodes")}</p>
          <ul className="mt-2 grid grid-cols-2 gap-1 font-mono text-sm">
            {backupCodes.map((c) => (
              <li key={c} className="rounded bg-sand-100 px-2 py-1">
                {c}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
