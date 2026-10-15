import { ProviderShell } from "./shell";
import type { PaymentProviderCapabilities } from "../types";

export interface MtnMomoConfig {
  environment: "sandbox" | "production";
  baseUrl?: string;
  subscriptionKey?: string;
  apiUser?: string;
  apiKey?: string;
  webhookSecret?: string;
}

/**
 * MTN Mobile Money (Cameroon) adapter SHELL.
 *
 * Collections (request-to-pay), disbursements (payouts) and callbacks must be implemented from
 * the official MTN MoMo developer documentation once merchant credentials exist. Until then the
 * adapter only validates configuration and refuses to run (PaymentProviderError NOT_IMPLEMENTED).
 * Mobile Money has no pre-authorisation: deposits are real debits refunded after return.
 */
export class MtnMomoProvider extends ProviderShell {
  readonly id = "mtn-momo";
  readonly method = "MTN_MOBILE_MONEY" as const;
  readonly capabilities: PaymentProviderCapabilities = {
    supportsPreAuthorisation: false,
    supportsRefunds: true,
    supportsPayouts: true,
    supportsWebhooks: true,
  };

  constructor(config: MtnMomoConfig) {
    super({
      environment: config.environment,
      baseUrl: config.baseUrl,
      webhookSecret: config.webhookSecret,
      requiredCredentials: {
        MTN_MOMO_SUBSCRIPTION_KEY: config.subscriptionKey,
        MTN_MOMO_API_USER: config.apiUser,
        MTN_MOMO_API_KEY: config.apiKey,
        MTN_MOMO_WEBHOOK_SECRET: config.webhookSecret,
      },
    });
  }
}
