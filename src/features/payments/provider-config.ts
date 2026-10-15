import {
  CardProvider,
  MtnMomoProvider,
  OrangeMoneyProvider,
  PaymentProviderError,
  type PaymentMethod,
} from "@ridekmer/payments";

import { decryptField, encryptField } from "@/lib/crypto";
import { getEnv } from "@/lib/env";
import { recordAudit } from "@/server/audit";
import { db } from "@/server/db";

import type { PaymentProviderKey } from "@/generated/prisma/enums";

export type ProviderEnvironment = "mock" | "sandbox" | "production";

export const PROVIDER_KEYS: PaymentProviderKey[] = ["MTN_MOMO", "ORANGE_MONEY", "CARD"];

export const PROVIDER_METHOD: Record<PaymentProviderKey, PaymentMethod> = {
  MTN_MOMO: "MTN_MOBILE_MONEY",
  ORANGE_MONEY: "ORANGE_MONEY",
  CARD: "CARD",
};

export const PROVIDER_SLUG: Record<PaymentProviderKey, string> = {
  MTN_MOMO: "mtn-momo",
  ORANGE_MONEY: "orange-money",
  CARD: "card",
};

/** Credential fields per provider; names match the environment variables they override. */
export const CREDENTIAL_FIELDS: Record<PaymentProviderKey, string[]> = {
  MTN_MOMO: [
    "MTN_MOMO_SUBSCRIPTION_KEY",
    "MTN_MOMO_API_USER",
    "MTN_MOMO_API_KEY",
    "MTN_MOMO_WEBHOOK_SECRET",
  ],
  ORANGE_MONEY: [
    "ORANGE_MONEY_CLIENT_ID",
    "ORANGE_MONEY_CLIENT_SECRET",
    "ORANGE_MONEY_MERCHANT_KEY",
    "ORANGE_MONEY_WEBHOOK_SECRET",
  ],
  CARD: ["CARD_PAYMENT_PUBLIC_KEY", "CARD_PAYMENT_SECRET_KEY", "CARD_PAYMENT_WEBHOOK_SECRET"],
};

export interface ResolvedProviderSettings {
  provider: PaymentProviderKey;
  enabled: boolean;
  environment: ProviderEnvironment;
  baseUrl?: string;
  cardProviderId?: string;
  credentials: Record<string, string | undefined>;
  /** "database" when an admin configuration row exists, otherwise "environment". */
  source: "database" | "environment";
  updatedAt?: Date;
}

type Credentials = Record<string, string | undefined>;

function envSettings(key: PaymentProviderKey): ResolvedProviderSettings {
  const env = getEnv();
  switch (key) {
    case "MTN_MOMO":
      return {
        provider: key,
        enabled: true,
        environment: env.MTN_MOMO_ENVIRONMENT,
        baseUrl: env.MTN_MOMO_BASE_URL,
        credentials: {
          MTN_MOMO_SUBSCRIPTION_KEY: env.MTN_MOMO_SUBSCRIPTION_KEY,
          MTN_MOMO_API_USER: env.MTN_MOMO_API_USER,
          MTN_MOMO_API_KEY: env.MTN_MOMO_API_KEY,
          MTN_MOMO_WEBHOOK_SECRET: env.MTN_MOMO_WEBHOOK_SECRET,
        },
        source: "environment",
      };
    case "ORANGE_MONEY":
      return {
        provider: key,
        enabled: true,
        environment: env.ORANGE_MONEY_ENVIRONMENT,
        baseUrl: env.ORANGE_MONEY_BASE_URL,
        credentials: {
          ORANGE_MONEY_CLIENT_ID: env.ORANGE_MONEY_CLIENT_ID,
          ORANGE_MONEY_CLIENT_SECRET: env.ORANGE_MONEY_CLIENT_SECRET,
          ORANGE_MONEY_MERCHANT_KEY: env.ORANGE_MONEY_MERCHANT_KEY,
          ORANGE_MONEY_WEBHOOK_SECRET: env.ORANGE_MONEY_WEBHOOK_SECRET,
        },
        source: "environment",
      };
    case "CARD":
      return {
        provider: key,
        enabled: true,
        environment:
          env.CARD_PAYMENT_PROVIDER === "mock"
            ? "mock"
            : env.APP_ENV === "production"
              ? "production"
              : "sandbox",
        cardProviderId:
          env.CARD_PAYMENT_PROVIDER === "mock" ? undefined : env.CARD_PAYMENT_PROVIDER,
        credentials: {
          CARD_PAYMENT_PUBLIC_KEY: env.CARD_PAYMENT_PUBLIC_KEY,
          CARD_PAYMENT_SECRET_KEY: env.CARD_PAYMENT_SECRET_KEY,
          CARD_PAYMENT_WEBHOOK_SECRET: env.CARD_PAYMENT_WEBHOOK_SECRET,
        },
        source: "environment",
      };
  }
}

function decryptCredentials(enc: string | null): Credentials {
  if (!enc) return {};
  try {
    return JSON.parse(decryptField(enc)) as Credentials;
  } catch {
    return {};
  }
}

function isEnvironment(value: string): value is ProviderEnvironment {
  return value === "mock" || value === "sandbox" || value === "production";
}

/**
 * Merge the admin configuration (database) over the environment variables. A database row
 * wins entirely for environment/base URL/enabled; credentials fall back field by field so a
 * secret kept in Vercel still applies when the admin left that field empty.
 */
export function mergeProviderSettings(
  key: PaymentProviderKey,
  row: {
    enabled: boolean;
    environment: string;
    baseUrl: string | null;
    cardProviderId: string | null;
    credentials: Credentials;
    updatedAt: Date;
  } | null,
  fromEnv: ResolvedProviderSettings = envSettings(key),
): ResolvedProviderSettings {
  if (!row) return fromEnv;
  const credentials: Credentials = { ...fromEnv.credentials };
  for (const field of CREDENTIAL_FIELDS[key]) {
    if (row.credentials[field]) credentials[field] = row.credentials[field];
  }
  return {
    provider: key,
    enabled: row.enabled,
    environment: isEnvironment(row.environment) ? row.environment : "mock",
    baseUrl: row.baseUrl ?? fromEnv.baseUrl,
    cardProviderId: row.cardProviderId ?? fromEnv.cardProviderId,
    credentials,
    source: "database",
    updatedAt: row.updatedAt,
  };
}

export async function resolveProviderSettings(
  key: PaymentProviderKey,
): Promise<ResolvedProviderSettings> {
  const row = await db.paymentProviderConfig.findUnique({ where: { provider: key } });
  return mergeProviderSettings(
    key,
    row ? { ...row, credentials: decryptCredentials(row.credentialsEnc) } : null,
  );
}

/** Version token used by the registry to detect configuration changes. */
export async function providerConfigVersion(): Promise<string> {
  const rows = await db.paymentProviderConfig.findMany({
    select: { provider: true, updatedAt: true },
  });
  return rows
    .map((r) => `${r.provider}:${r.updatedAt.getTime()}`)
    .sort()
    .join("|");
}

/** Build the real adapter from settings; throws PaymentProviderError when misconfigured. */
export function buildRealProvider(settings: ResolvedProviderSettings) {
  const environment = settings.environment === "production" ? "production" : "sandbox";
  const c = settings.credentials;
  switch (settings.provider) {
    case "MTN_MOMO":
      return new MtnMomoProvider({
        environment,
        baseUrl: settings.baseUrl,
        subscriptionKey: c.MTN_MOMO_SUBSCRIPTION_KEY,
        apiUser: c.MTN_MOMO_API_USER,
        apiKey: c.MTN_MOMO_API_KEY,
        webhookSecret: c.MTN_MOMO_WEBHOOK_SECRET,
      });
    case "ORANGE_MONEY":
      return new OrangeMoneyProvider({
        environment,
        baseUrl: settings.baseUrl,
        clientId: c.ORANGE_MONEY_CLIENT_ID,
        clientSecret: c.ORANGE_MONEY_CLIENT_SECRET,
        merchantKey: c.ORANGE_MONEY_MERCHANT_KEY,
        webhookSecret: c.ORANGE_MONEY_WEBHOOK_SECRET,
      });
    case "CARD":
      if (!settings.cardProviderId)
        throw new PaymentProviderError("NOT_CONFIGURED", "Missing configuration: cardProviderId");
      return new CardProvider({
        providerId: settings.cardProviderId,
        environment,
        baseUrl: settings.baseUrl,
        publicKey: c.CARD_PAYMENT_PUBLIC_KEY,
        secretKey: c.CARD_PAYMENT_SECRET_KEY,
        webhookSecret: c.CARD_PAYMENT_WEBHOOK_SECRET,
      });
  }
}

export interface ValidationOutcome {
  ok: boolean;
  code: "OK_MOCK" | "OK_SHELL" | "NOT_CONFIGURED" | "DISABLED" | "MOCK_IN_PRODUCTION";
  detail?: string;
}

/**
 * Validate a configuration without any network call: mocks are fine outside production;
 * real providers must have every credential and base URL. The shells cannot be "tested"
 * against the provider until they are implemented, and the result says so.
 */
export function validateProviderSettings(settings: ResolvedProviderSettings): ValidationOutcome {
  const env = getEnv();
  const production = env.NODE_ENV === "production" && env.APP_ENV === "production";
  if (!settings.enabled) return { ok: false, code: "DISABLED" };
  if (settings.environment === "mock") {
    return production ? { ok: false, code: "MOCK_IN_PRODUCTION" } : { ok: true, code: "OK_MOCK" };
  }
  try {
    buildRealProvider(settings);
    return {
      ok: true,
      code: "OK_SHELL",
      detail: "Configuration complete; adapter still to be implemented from official docs.",
    };
  } catch (error) {
    if (error instanceof PaymentProviderError)
      return { ok: false, code: "NOT_CONFIGURED", detail: error.message };
    throw error;
  }
}

/** Admin-facing view: never includes secret values, only which fields are set and where from. */
export async function getProviderConfigViews() {
  const rows = await db.paymentProviderConfig.findMany({
    include: { updatedBy: { select: { name: true } } },
  });
  const env = getEnv();
  const appUrl = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  return Promise.all(
    PROVIDER_KEYS.map(async (key) => {
      const row = rows.find((r) => r.provider === key) ?? null;
      const settings = mergeProviderSettings(
        key,
        row ? { ...row, credentials: decryptCredentials(row.credentialsEnc) } : null,
      );
      const validation = validateProviderSettings(settings);
      return {
        key,
        method: PROVIDER_METHOD[key],
        webhookUrl: `${appUrl}/api/webhooks/payments/${PROVIDER_SLUG[key]}`,
        enabled: settings.enabled,
        environment: settings.environment,
        baseUrl: settings.baseUrl ?? "",
        cardProviderId: settings.cardProviderId ?? "",
        source: settings.source,
        fields: CREDENTIAL_FIELDS[key].map((field) => ({
          name: field,
          set: Boolean(settings.credentials[field]),
          fromDatabase: Boolean(row?.credentialFields.includes(field)),
        })),
        validation,
        lastValidatedAt: row?.lastValidatedAt ?? null,
        lastValidationResult: row?.lastValidationResult ?? null,
        updatedAt: row?.updatedAt ?? null,
        updatedBy: row?.updatedBy?.name ?? null,
      };
    }),
  );
}

export interface SaveProviderConfigInput {
  provider: PaymentProviderKey;
  enabled: boolean;
  environment: ProviderEnvironment;
  baseUrl?: string | null;
  cardProviderId?: string | null;
  /** New credential values; empty strings keep the stored value, "__clear__" removes it. */
  credentials: Record<string, string>;
  actorId: string;
}

export async function saveProviderConfig(input: SaveProviderConfigInput) {
  const existing = await db.paymentProviderConfig.findUnique({
    where: { provider: input.provider },
  });
  const current = decryptCredentials(existing?.credentialsEnc ?? null);
  const next: Credentials = { ...current };
  const changedFields: string[] = [];
  for (const field of CREDENTIAL_FIELDS[input.provider]) {
    const value = input.credentials[field];
    if (value === undefined || value === "") continue;
    if (value === "__clear__") {
      if (next[field] !== undefined) changedFields.push(field);
      delete next[field];
      continue;
    }
    next[field] = value;
    changedFields.push(field);
  }
  const credentialFields = Object.keys(next).filter((k) => next[k]);
  const data = {
    enabled: input.enabled,
    environment: input.environment,
    baseUrl: input.baseUrl?.trim() || null,
    cardProviderId: input.cardProviderId?.trim() || null,
    credentialsEnc: credentialFields.length ? encryptField(JSON.stringify(next)) : null,
    credentialFields,
    updatedById: input.actorId,
    lastValidatedAt: null,
    lastValidationResult: null,
  };
  const saved = await db.paymentProviderConfig.upsert({
    where: { provider: input.provider },
    update: data,
    create: { provider: input.provider, ...data },
  });
  await recordAudit({
    actorId: input.actorId,
    action: "payment_provider.configure",
    entityType: "PaymentProviderConfig",
    entityId: saved.id,
    before: existing
      ? { enabled: existing.enabled, environment: existing.environment, baseUrl: existing.baseUrl }
      : undefined,
    after: {
      enabled: saved.enabled,
      environment: saved.environment,
      baseUrl: saved.baseUrl,
      cardProviderId: saved.cardProviderId,
      // Field names only: secret values are never written to the audit log.
      credentialFieldsChanged: changedFields,
    },
  });
  return saved;
}

export async function runProviderValidation(provider: PaymentProviderKey, actorId: string) {
  const settings = await resolveProviderSettings(provider);
  const outcome = validateProviderSettings(settings);
  await db.paymentProviderConfig.updateMany({
    where: { provider },
    data: {
      lastValidatedAt: new Date(),
      lastValidationResult: `${outcome.code}${outcome.detail ? `: ${outcome.detail}` : ""}`,
    },
  });
  await recordAudit({
    actorId,
    action: "payment_provider.validate",
    entityType: "PaymentProviderConfig",
    entityId: provider,
    after: { code: outcome.code },
  });
  return outcome;
}
