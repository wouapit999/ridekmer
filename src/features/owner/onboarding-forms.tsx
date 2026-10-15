"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";

import {
  acceptOwnerAgreementAction,
  saveOwnerProfileAction,
  savePayoutAction,
  type OwnerActionResult,
} from "./actions";

const initial: OwnerActionResult = { ok: false };

function useErrorText() {
  const te = useTranslations("owner.errors");
  const tv = useTranslations("validation");
  return (code?: string) => {
    if (!code) return null;
    if (te.has(code as "names")) return te(code as "names");
    return tv("required");
  };
}

export function OwnerProfileForm({
  profile,
}: {
  profile: {
    ownerType: string;
    displayName: string;
    firstName: string | null;
    lastName: string | null;
    company: {
      legalName: string;
      tradeName: string | null;
      legalForm: string | null;
      representativeName: string | null;
      representativeTitle: string | null;
      contactEmail: string | null;
      contactPhone: string | null;
    } | null;
  };
}) {
  const t = useTranslations("owner.profile");
  const err = useErrorText();
  const [state, action, pending] = useActionState(saveOwnerProfileAction, initial);
  const [ownerType, setOwnerType] = useState(profile.ownerType);
  return (
    <form
      action={action}
      className="grid gap-4 rounded-xl border border-sand-200 bg-white p-5 sm:grid-cols-2"
    >
      {state.ok ? (
        <div className="sm:col-span-2">
          <Alert tone="success">{t("saved")}</Alert>
        </div>
      ) : null}
      {state.message ? (
        <div className="sm:col-span-2">
          <Alert tone="danger">{err(state.message)}</Alert>
        </div>
      ) : null}
      <fieldset className="sm:col-span-2">
        <legend className="text-sm font-medium text-sand-800">{t("ownerType")}</legend>
        <div className="mt-2 flex gap-4">
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="ownerType"
              value="INDIVIDUAL"
              checked={ownerType === "INDIVIDUAL"}
              onChange={() => setOwnerType("INDIVIDUAL")}
              className="h-4 w-4"
            />{" "}
            {t("individual")}
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="ownerType"
              value="COMPANY"
              checked={ownerType === "COMPANY"}
              onChange={() => setOwnerType("COMPANY")}
              className="h-4 w-4"
            />{" "}
            {t("company")}
          </label>
        </div>
      </fieldset>
      <Field
        id="displayName"
        label={t("displayName")}
        required
        error={err(state.errors?.displayName)}
        className="sm:col-span-2"
      >
        <Input id="displayName" name="displayName" defaultValue={profile.displayName} required />
      </Field>
      {ownerType === "INDIVIDUAL" ? (
        <>
          <Field
            id="firstName"
            label={t("firstName")}
            required
            error={err(state.errors?.firstName)}
          >
            <Input id="firstName" name="firstName" defaultValue={profile.firstName ?? ""} />
          </Field>
          <Field id="lastName" label={t("lastName")} required>
            <Input id="lastName" name="lastName" defaultValue={profile.lastName ?? ""} />
          </Field>
          <Field id="identityNumber" label={t("identityNumber")} hint={t("encryptedHint")}>
            <Input id="identityNumber" name="identityNumber" autoComplete="off" />
          </Field>
          <Field id="taxIdentifier" label={t("taxIdentifier")}>
            <Input id="taxIdentifier" name="taxIdentifier" autoComplete="off" />
          </Field>
        </>
      ) : (
        <>
          <Field
            id="legalName"
            label={t("legalName")}
            required
            error={err(state.errors?.legalName)}
          >
            <Input
              id="legalName"
              name="legalName"
              defaultValue={profile.company?.legalName ?? ""}
            />
          </Field>
          <Field id="tradeName" label={t("tradeName")}>
            <Input
              id="tradeName"
              name="tradeName"
              defaultValue={profile.company?.tradeName ?? ""}
            />
          </Field>
          <Field id="registrationNumber" label={t("registrationNumber")} hint={t("encryptedHint")}>
            <Input id="registrationNumber" name="registrationNumber" autoComplete="off" />
          </Field>
          <Field id="taxpayerNumber" label={t("taxpayerNumber")}>
            <Input id="taxpayerNumber" name="taxpayerNumber" autoComplete="off" />
          </Field>
          <Field id="legalForm" label={t("legalForm")}>
            <Input
              id="legalForm"
              name="legalForm"
              defaultValue={profile.company?.legalForm ?? ""}
            />
          </Field>
          <Field id="representativeName" label={t("representativeName")} required>
            <Input
              id="representativeName"
              name="representativeName"
              defaultValue={profile.company?.representativeName ?? ""}
            />
          </Field>
          <Field id="representativeTitle" label={t("representativeTitle")}>
            <Input
              id="representativeTitle"
              name="representativeTitle"
              defaultValue={profile.company?.representativeTitle ?? ""}
            />
          </Field>
          <Field id="contactEmail" label={t("contactEmail")}>
            <Input
              id="contactEmail"
              name="contactEmail"
              type="email"
              defaultValue={profile.company?.contactEmail ?? ""}
            />
          </Field>
          <Field id="contactPhone" label={t("contactPhone")}>
            <Input
              id="contactPhone"
              name="contactPhone"
              type="tel"
              defaultValue={profile.company?.contactPhone ?? ""}
            />
          </Field>
        </>
      )}
      <div className="sm:col-span-2">
        <Button type="submit" loading={pending}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}

export function PayoutForm({
  profile,
}: {
  profile: {
    payoutMethod: string | null;
    payoutMobileNumber: string | null;
    payoutBankName: string | null;
    payoutAccountName: string | null;
  };
}) {
  const t = useTranslations("owner.payout");
  const err = useErrorText();
  const [state, action, pending] = useActionState(savePayoutAction, initial);
  const [method, setMethod] = useState(profile.payoutMethod ?? "MTN_MOBILE_MONEY");
  return (
    <form
      action={action}
      className="grid gap-4 rounded-xl border border-sand-200 bg-white p-5 sm:grid-cols-2"
    >
      <p className="text-sm text-sand-700 sm:col-span-2">{t("intro")}</p>
      {state.ok ? (
        <div className="sm:col-span-2">
          <Alert tone="success">{t("saved")}</Alert>
        </div>
      ) : null}
      {state.message ? (
        <div className="sm:col-span-2">
          <Alert tone="danger">{err(state.message)}</Alert>
        </div>
      ) : null}
      <Field id="payoutMethod" label={t("method")} required className="sm:col-span-2">
        <Select
          id="payoutMethod"
          name="payoutMethod"
          value={method}
          onChange={(e) => setMethod(e.target.value)}
        >
          {(["MTN_MOBILE_MONEY", "ORANGE_MONEY", "BANK_TRANSFER"] as const).map((m) => (
            <option key={m} value={m}>
              {t(m)}
            </option>
          ))}
        </Select>
      </Field>
      {method === "BANK_TRANSFER" ? (
        <>
          <Field
            id="payoutBankName"
            label={t("bankName")}
            required
            error={err(state.errors?.payoutBankAccount)}
          >
            <Input
              id="payoutBankName"
              name="payoutBankName"
              defaultValue={profile.payoutBankName ?? ""}
            />
          </Field>
          <Field id="payoutBankAccount" label={t("bankAccount")} required>
            <Input id="payoutBankAccount" name="payoutBankAccount" autoComplete="off" />
          </Field>
        </>
      ) : (
        <Field
          id="payoutMobileNumber"
          label={t("mobileNumber")}
          required
          error={err(state.errors?.payoutMobileNumber)}
          className="sm:col-span-2"
        >
          <Input
            id="payoutMobileNumber"
            name="payoutMobileNumber"
            type="tel"
            inputMode="tel"
            defaultValue={profile.payoutMobileNumber ?? ""}
            placeholder="6XX XXX XXX"
          />
        </Field>
      )}
      <Field
        id="payoutAccountName"
        label={t("accountName")}
        required
        error={err(state.errors?.payoutAccountName)}
        className="sm:col-span-2"
      >
        <Input
          id="payoutAccountName"
          name="payoutAccountName"
          defaultValue={profile.payoutAccountName ?? ""}
          required
        />
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" loading={pending}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}

export function AgreementForm({ markdown, checksum }: { markdown: string; checksum: string }) {
  const t = useTranslations("owner.agreement");
  const tv = useTranslations("validation");
  const [state, action, pending] = useActionState(acceptOwnerAgreementAction, initial);
  return (
    <form action={action} className="space-y-4 rounded-xl border border-sand-200 bg-white p-5">
      <p className="text-sm text-sand-700">{t("intro")}</p>
      <article
        className="max-h-96 overflow-y-auto rounded-md border border-sand-200 bg-sand-50 p-4 text-sm leading-relaxed whitespace-pre-wrap text-sand-800"
        tabIndex={0}
      >
        {markdown}
      </article>
      <p className="text-xs text-sand-600">
        {t("checksum")}: <code className="font-mono">{checksum.slice(0, 16)}…</code> ·{" "}
        {t("notCertified")}
      </p>
      {state.errors?.accept ? <Alert tone="danger">{tv("accept")}</Alert> : null}
      {state.ok ? (
        <Alert tone="success">
          {t("accepted", { date: new Date().toISOString().slice(0, 10) })}
        </Alert>
      ) : null}
      <label className="flex items-start gap-2 text-sm text-sand-800">
        <Checkbox name="accept" value="1" className="mt-0.5" /> {t("accept")}
      </label>
      <Button type="submit" loading={pending}>
        {t("submit")}
      </Button>
    </form>
  );
}
