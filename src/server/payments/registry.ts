import {
  ManualPaymentProvider,
  MockPaymentProvider,
  PaymentProviderError,
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
import { getPaymentSettings } from "@/features/payments/settings";
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

async function build(method: PaymentMethod): Promise<PaymentProvider> {
  switch (method) {
    case "MTN_MOBILE_MONEY":
      return buildReal("MTN_MOMO");
    case "ORANGE_MONEY":
      return buildReal("ORANGE_MONEY");
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
  state.providers[method] = provider;
  return provider;
}

export interface AvailableMethod {
  method: PaymentMethod;
  providerId: string;
  environment: PaymentProvider["environment"];
  /** Customer-selectable at checkout (cash is recorded by staff only). */
  customerSelectable: boolean;
}

/** Methods that can be used right now, with mocks excluded in production. */
export async function listAvailableMethods(): Promise<AvailableMethod[]> {
  const settings = await getPaymentSettings();
  const out: AvailableMethod[] = [];
  for (const key of PROVIDER_KEYS) {
    const method = PROVIDER_METHOD[key];
    try {
      const p = await getPaymentProvider(method);
      out.push({ method, providerId: p.id, environment: p.environment, customerSelectable: true });
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
    });
  if (settings.cashEnabled)
    out.push({
      method: "CASH",
      providerId: "manual-cash",
      environment: "production",
      customerSelectable: false,
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
