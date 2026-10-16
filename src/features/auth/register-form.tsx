"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { Link, useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { parsePhone } from "@/lib/phone";

import { activateOwnerSpace } from "@/features/account/actions";

export function RegisterForm({ intent }: { intent?: string }) {
  const t = useTranslations("auth.register");
  const tv = useTranslations("validation");
  const locale = useLocale();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [wantsOwner, setWantsOwner] = useState(intent === "owner");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    if (password.length < 10) {
      setError(tv("passwordMin", { min: 10 }));
      return;
    }
    if (!form.get("accept")) {
      setError(tv("accept"));
      return;
    }
    const rawPhone = String(form.get("phone") ?? "").trim();
    const phone = rawPhone ? parsePhone(rawPhone) : null;
    if (rawPhone && !phone) {
      setError(tv("phone"));
      return;
    }
    setPending(true);
    const { error: err } = await authClient.signUp.email({
      name: String(form.get("name") ?? "").trim(),
      email: String(form.get("email") ?? "")
        .trim()
        .toLowerCase(),
      password,
      preferredLocale: String(form.get("locale") ?? locale),
      ...(phone ? { phoneNumber: phone.e164 } : {}),
    });
    if (err) {
      setPending(false);
      // Surface the server's reason (e.g. "Invalid origin", "Password too short") so a
      // configuration problem is visible to the tester instead of a generic message.
      setError(
        err.code === "USER_ALREADY_EXISTS"
          ? t("errorExists")
          : err.message
            ? `${t("errorGeneric")} (${err.message})`
            : t("errorGeneric"),
      );
      return;
    }
    if (wantsOwner) {
      await activateOwnerSpace();
      router.push("/owner");
    } else {
      router.push("/account");
    }
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field id="name" label={t("name")} required>
        <Input id="name" name="name" autoComplete="name" required minLength={2} />
      </Field>
      <Field id="email" label={t("email")} required>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field id="phone" label={t("phone")} optionalLabel="">
        <Input
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="6XX XXX XXX"
        />
      </Field>
      <Field id="password" label={t("password")} hint={t("passwordHint")} required>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          aria-describedby="password-hint"
        />
      </Field>
      <Field id="locale" label={t("locale")}>
        <Select id="locale" name="locale" defaultValue={locale}>
          <option value="fr">Français</option>
          <option value="en">English</option>
        </Select>
      </Field>
      <fieldset className="space-y-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="intent"
            value="customer"
            checked={!wantsOwner}
            onChange={() => setWantsOwner(false)}
            className="h-4 w-4"
          />
          {t("intentCustomer")}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="intent"
            value="owner"
            checked={wantsOwner}
            onChange={() => setWantsOwner(true)}
            className="h-4 w-4"
          />
          {t("intentOwner")}
        </label>
      </fieldset>
      <label className="flex items-start gap-2 text-sm text-sand-800">
        <Checkbox name="accept" value="1" required className="mt-0.5" />
        <span>
          {t.rich("accept", {
            terms: (chunks) => (
              <Link href="/terms" className="text-brand-700 underline">
                {chunks}
              </Link>
            ),
            privacy: (chunks) => (
              <Link href="/privacy" className="text-brand-700 underline">
                {chunks}
              </Link>
            ),
          })}
        </span>
      </label>
      <Button type="submit" className="w-full" loading={pending}>
        {t("submit")}
      </Button>
      <p className="text-center text-sm text-sand-700">
        {t("haveAccount")}{" "}
        <Link href="/login" className="font-medium text-brand-700 hover:underline">
          {t("login")}
        </Link>
      </p>
    </form>
  );
}
