import {
  CardProvider,
  ManualPaymentProvider,
  MockPaymentProvider,
  MtnMomoProvider,
  OrangeMoneyProvider,
  PaymentProviderError,
  type PaymentMethod,
  type PaymentProvider,
} from "@ridekmer/payments";

import { getPaymentSettings } from "@/features/payments/settings";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

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

type Registry = Partial<Record<PaymentMethod, PaymentProvider>>;
const globalRegistry = globalThis as unknown as { __ridekmerPayments?: Registry };
const registry: Registry = (globalRegistry.__ridekmerPayments ??= {});

function isProduction(): boolean {
  const env = getEnv();
  return env.NODE_ENV === "production" && env.APP_ENV === "production";
}

function mock(id: string, method: PaymentMethod, secret: string | undefined): PaymentProvider {
  if (isProduction()) {
    throw new PaymentProviderError("NOT_CONFIGURED", `${method} is not configured for production`);
  }
  return new MockPaymentProvider({
    id,
    method,
    webhookSecret: secret ?? `${id}-dev-webhook-secret`,
  });
}

async function build(method: PaymentMethod): Promise<PaymentProvider> {
  const env = getEnv();
  switch (method) {
    case "MTN_MOBILE_MONEY":
      if (env.MTN_MOMO_ENVIRONMENT === "mock")
        return mock("mock-mtn-momo", method, env.MTN_MOMO_WEBHOOK_SECRET);
      return new MtnMomoProvider({
        environment: env.MTN_MOMO_ENVIRONMENT,
        baseUrl: env.MTN_MOMO_BASE_URL,
        subscriptionKey: env.MTN_MOMO_SUBSCRIPTION_KEY,
        apiUser: env.MTN_MOMO_API_USER,
        apiKey: env.MTN_MOMO_API_KEY,
        webhookSecret: env.MTN_MOMO_WEBHOOK_SECRET,
      });
    case "ORANGE_MONEY":
      if (env.ORANGE_MONEY_ENVIRONMENT === "mock")
        return mock("mock-orange-money", method, env.ORANGE_MONEY_WEBHOOK_SECRET);
      return new OrangeMoneyProvider({
        environment: env.ORANGE_MONEY_ENVIRONMENT,
        baseUrl: env.ORANGE_MONEY_BASE_URL,
        clientId: env.ORANGE_MONEY_CLIENT_ID,
        clientSecret: env.ORANGE_MONEY_CLIENT_SECRET,
        merchantKey: env.ORANGE_MONEY_MERCHANT_KEY,
        webhookSecret: env.ORANGE_MONEY_WEBHOOK_SECRET,
      });
    case "CARD":
      if (env.CARD_PAYMENT_PROVIDER === "mock")
        return mock("mock-card", method, env.CARD_PAYMENT_WEBHOOK_SECRET);
      return new CardProvider({
        providerId: env.CARD_PAYMENT_PROVIDER,
        environment: env.APP_ENV === "production" ? "production" : "sandbox",
        publicKey: env.CARD_PAYMENT_PUBLIC_KEY,
        secretKey: env.CARD_PAYMENT_SECRET_KEY,
        webhookSecret: env.CARD_PAYMENT_WEBHOOK_SECRET,
      });
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

/**
 * Resolve the provider for a payment method. Mock providers are cached per process so the
 * in-memory transaction state survives between the server action that initiates a payment
 * and the route that receives its (mock) webhook. Manual providers are rebuilt so setting
 * changes apply immediately.
 */
export async function getPaymentProvider(method: PaymentMethod): Promise<PaymentProvider> {
  if (method === "BANK_TRANSFER" || method === "CASH") return build(method);
  const cached = registry[method];
  if (cached) return cached;
  const provider = await build(method);
  registry[method] = provider;
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
  for (const method of ["MTN_MOBILE_MONEY", "ORANGE_MONEY", "CARD"] as const) {
    try {
      const p = await getPaymentProvider(method);
      out.push({
        method,
        providerId: p.id,
        environment: p.environment,
        customerSelectable: true,
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

/** Tests only: replace a provider. */
export function setPaymentProviderForTests(method: PaymentMethod, provider?: PaymentProvider) {
  if (provider) registry[method] = provider;
  else delete registry[method];
}
