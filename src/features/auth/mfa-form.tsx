"use client";

import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";

import { postLoginDestination } from "./post-login";

export function MfaForm() {
  const t = useTranslations("auth.mfa");
  const router = useRouter();
  const [useBackup, setUseBackup] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(event.currentTarget);
    const code = String(form.get("code") ?? "").replace(/\s/g, "");
    const trustDevice = Boolean(form.get("trust"));
    const result = useBackup
      ? await authClient.twoFactor.verifyBackupCode({ code, trustDevice })
      : await authClient.twoFactor.verifyTotp({ code, trustDevice });
    setPending(false);
    if (result.error) {
      setError(t("error"));
      return;
    }
    router.push(await postLoginDestination());
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field id="code" label={useBackup ? t("backupCode") : t("code")} required>
        <Input
          id="code"
          name="code"
          inputMode={useBackup ? "text" : "numeric"}
          autoComplete="one-time-code"
          required
          autoFocus
        />
      </Field>
      <label className="flex items-center gap-2 text-sm text-sand-800">
        <Checkbox name="trust" value="1" /> {t("trust")}
      </label>
      <Button type="submit" className="w-full" loading={pending}>
        {t("submit")}
      </Button>
      <button
        type="button"
        className="w-full text-sm text-brand-700 hover:underline"
        onClick={() => setUseBackup((v) => !v)}
      >
        {useBackup ? t("code") : t("useBackup")}
      </button>
    </form>
  );
}
