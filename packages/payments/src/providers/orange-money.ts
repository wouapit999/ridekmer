import { ProviderShell } from "./shell";
import type { PaymentProviderCapabilities } from "../types";

export interface OrangeMoneyConfig {
  environment: "sandbox" | "production";
  baseUrl?: string;
  clientId?: string;
  clientSecret?: string;
  merchantKey?: string;
  webhookSecret?: string;
}

/**
 * Orange Money (Cameroon) adapter SHELL. Implement against the official Orange Money merchant
 * API documentation and credentials; refuses to run until then.
 */
export class OrangeMoneyProvider extends ProviderShell {
  readonly id = "orange-money";
  readonly method = "ORANGE_MONEY" as const;
  readonly capabilities: PaymentProviderCapabilities = {
    supportsPreAuthorisation: false,
    supportsRefunds: true,
    supportsPayouts: true,
    supportsWebhooks: true,
  };

  constructor(config: OrangeMoneyConfig) {
    super({
      environment: config.environment,
      baseUrl: config.baseUrl,
      webhookSecret: config.webhookSecret,
      requiredCredentials: {
        ORANGE_MONEY_CLIENT_ID: config.clientId,
        ORANGE_MONEY_CLIENT_SECRET: config.clientSecret,
        ORANGE_MONEY_MERCHANT_KEY: config.merchantKey,
        ORANGE_MONEY_WEBHOOK_SECRET: config.webhookSecret,
      },
    });
  }
}
