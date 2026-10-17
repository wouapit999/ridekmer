import {
  ManualPaymentProvider,
  MockPaymentProvider,
  PaymentProviderError,
  isManualProviderId,
  type PaymentMethod,
  type PaymentProvider,
} from "@ridekmer/payments";

import {
  PROVIDER_KEYS,
  PROVIDER_METHOD,
  buildRealProvider,
  providerConfigVersion,
  resolveProviderSettings,
} from "@/features/payments/provider-config";
import { getPaymentSettings, type PaymentSettings } from "@/features/payments/settings";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

import type { PaymentProviderKey } from "@/generated/prisma/enums";

/** Public webhook slugs → payment method. Mock providers share the real slug so switching
 *  environments never changes the URL registered with the provider. */
export const WEBHOOK_SLUGS: Record<string, PaymentMethod> = {
  "mtn-momo": "MTN_MOBILE_MONEY",
  "orange-money": "ORANGE_MONEY",
  card: "CARD",
};

export function webhookSlugFor(method: PaymentMethod): string | null {
  const entry = Object.entries(WEBHOOK_SLUGS).find(([, m]) => m === method);
  return entry ? entry[0] : null;
}

interface RegistryState {
  version: string;
  checkedAt: number;
  providers: Partial<Record<PaymentMethod, PaymentProvider>>;
  /** Mock instances survive configuration reloads so in-memory transactions are kept. */
  mocks: Partial<Record<PaymentMethod, MockPaymentProvider>>;
}
const globalRegistry = globalThis as unknown as { __ridekmerPayments?: RegistryState };
const state: RegistryState = (globalRegistry.__ridekmerPayments ??= {
  version: "",
  checkedAt: 0,
  providers: {},
  mocks: {},
});
const VERSION_TTL_MS = 15_000;

function isProduction(): boolean {
  const env = getEnv();
  return env.NODE_ENV === "production" && env.APP_ENV === "production";
}

const MOCK_IDS: Record<PaymentProviderKey, string> = {
  MTN_MOMO: "mock-mtn-momo",
  ORANGE_MONEY: "mock-orange-money",
  CARD: "mock-card",
};

function mock(key: PaymentProviderKey, secret: string | undefined): PaymentProvider {
  const method = PROVIDER_METHOD[key];
  if (isProduction()) {
    throw new PaymentProviderError("NOT_CONFIGURED", `${method} is not configured for production`);
  }
  const existing = state.mocks[method];
  if (existing) return existing;
  const created = new MockPaymentProvider({
    id: MOCK_IDS[key],
    method,
    webhookSecret: secret ?? `${MOCK_IDS[key]}-dev-webhook-secret`,
  });
  state.mocks[method] = created;
  return created;
}

async function buildReal(key: PaymentProviderKey): Promise<PaymentProvider> {
  const settings = await resolveProviderSettings(key);
  if (!settings.enabled) {
    throw new PaymentProviderError(
      "NOT_CONFIGURED",
      `${key} is disabled in the admin configuration`,
    );
  }
  if (settings.environment === "mock") {
    const secretField = Object.keys(settings.credentials).find((f) => f.endsWith("WEBHOOK_SECRET"));
    return mock(key, secretField ? settings.credentials[secretField] : undefined);
  }
  return buildRealProvider(settings);
}

type MobileMoneyMethod = Extract<PaymentMethod, "MTN_MOBILE_MONEY" | "ORANGE_MONEY">;

/** The company number the customer sends money to by hand for a Mobile Money method. */
export function manualMobileMoneyNumber(method: MobileMoneyMethod, settings: PaymentSettings) {
  return method === "MTN_MOBILE_MONEY"
    ? settings.manualMobileMoney.mtnNumber
    : settings.manualMobileMoney.orangeNumber;
}

function manualMobileMoney(method: MobileMoneyMethod, settings: PaymentSettings) {
  const number = manualMobileMoneyNumber(method, settings);
  const name = settings.manualMobileMoney.accountName;
  return new ManualPaymentProvider({
    method,
    customerInstruction: {
      fr: `Envoyez le montant au ${number} (${name}), puis saisissez l'ID de la transaction.`,
      en: `Send the amount to ${number} (${name}), then enter the transaction ID.`,
    },
    expiryHours: settings.manualMobileMoney.expiryHours,
  });
}

/**
 * Mobile Money goes through the operator API when it is configured; until then (and always in
 * production while only mocks exist) the customer sends the money by hand to the company
 * number and finance confirms it, unless the manual option is switched off.
 */
async function buildMobileMoney(
  method: MobileMoneyMethod,
  key: PaymentProviderKey,
): Promise<PaymentProvider> {
  try {
    return await buildReal(key);
  } catch (error) {
    if (!(error instanceof PaymentProviderError) || error.code !== "NOT_CONFIGURED") throw error;
    const settings = await getPaymentSettings();
    if (!settings.manualMobileMoneyEnabled) throw error;
    return manualMobileMoney(method, settings);
  }
}

async function build(method: PaymentMethod): Promise<PaymentProvider> {
  switch (method) {
    case "MTN_MOBILE_MONEY":
      return buildMobileMoney(method, "MTN_MOMO");
    case "ORANGE_MONEY":
      return buildMobileMoney(method, "ORANGE_MONEY");
    case "CARD":
      return buildReal("CARD");
    case "BANK_TRANSFER": {
      const settings = await getPaymentSettings();
      return new ManualPaymentProvider({
        method,
        customerInstruction: settings.bankTransferInstructions,
        expiryHours: settings.bankTransferExpiryHours,
      });
    }
    case "CASH":
      return new ManualPaymentProvider({
        method,
        customerInstruction: {
          fr: "Paiement en espèces en agence, enregistré par un agent autorisé.",
          en: "Cash paid at a branch and recorded by an authorised agent.",
        },
      });
  }
}

async function refreshVersion() {
  const now = Date.now();
  if (now - state.checkedAt < VERSION_TTL_MS) return;
  state.checkedAt = now;
  const version = await providerConfigVersion();
  if (version !== state.version) {
    state.version = version;
    state.providers = {};
  }
}

/**
 * Resolve the provider for a payment method from the admin configuration (database) with
 * environment-variable fallback. Real/mock providers are cached per process and rebuilt when
 * the configuration changes; manual providers are rebuilt each time so setting changes apply
 * immediately.
 */
export async function getPaymentProvider(method: PaymentMethod): Promise<PaymentProvider> {
  if (method === "BANK_TRANSFER" || method === "CASH") return build(method);
  await refreshVersion();
  const cached = state.providers[method];
  if (cached) return cached;
  const provider = await build(method);
  if (!isManualProviderId(provider.id)) state.providers[method] = provider;
  return provider;
}

/**
 * The provider that handled an existing payment. A Mobile Money payment sent by hand stays
 * manual even after the operator API is switched on, so it is never polled or refunded there.
 */
export async function getProviderForPayment(payment: {
  method: PaymentMethod;
  provider: string;
}): Promise<PaymentProvider> {
  if (
    isManualProviderId(payment.provider) &&
    (payment.method === "MTN_MOBILE_MONEY" || payment.method === "ORANGE_MONEY")
  ) {
    return manualMobileMoney(payment.method, await getPaymentSettings());
  }
  return getPaymentProvider(payment.method);
}

export interface AvailableMethod {
  method: PaymentMethod;
  providerId: string;
  environment: PaymentProvider["environment"];
  /** Customer-selectable at checkout (cash is recorded by staff only). */
  customerSelectable: boolean;
  /** Recorded by hand and confirmed by finance (no operator API involved). */
  manual: boolean;
}

/** Methods that can be used right now, with mocks excluded in production. */
export async function listAvailableMethods(): Promise<AvailableMethod[]> {
  const settings = await getPaymentSettings();
  const out: AvailableMethod[] = [];
  for (const key of PROVIDER_KEYS) {
    const method = PROVIDER_METHOD[key];
    try {
      const p = await getPaymentProvider(method);
      out.push({
        method,
        providerId: p.id,
        environment: p.environment,
        customerSelectable: true,
        manual: isManualProviderId(p.id),
      });
    } catch (error) {
      if (error instanceof PaymentProviderError) {
        logger.warn("payments.method_unavailable", { method, code: error.code });
        continue;
      }
      throw error;
    }
  }
  if (settings.bankTransferEnabled)
    out.push({
      method: "BANK_TRANSFER",
      providerId: "manual-bank-transfer",
      environment: "production",
      customerSelectable: true,
      manual: true,
    });
  if (settings.cashEnabled)
    out.push({
      method: "CASH",
      providerId: "manual-cash",
      environment: "production",
      customerSelectable: false,
      manual: true,
    });
  return out;
}

/** Force the next resolution to re-read the configuration (after an admin change). */
export function resetPaymentRegistry() {
  state.checkedAt = 0;
  state.version = "";
  state.providers = {};
}

/** Tests only: replace a provider. */
export function setPaymentProviderForTests(method: PaymentMethod, provider?: PaymentProvider) {
  if (provider) state.providers[method] = provider;
  else delete state.providers[method];
}
