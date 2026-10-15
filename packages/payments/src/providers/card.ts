import { ProviderShell } from "./shell";
import type { PaymentProviderCapabilities } from "../types";

export interface CardProviderConfig {
  /** Identifier of the selected acquirer / PSP (decided by the business, see OPEN_ITEMS). */
  providerId: string;
  environment: "sandbox" | "production";
  baseUrl?: string;
  publicKey?: string;
  secretKey?: string;
  webhookSecret?: string;
  /** Set only when the selected PSP exposes a genuine authorisation hold. */
  supportsPreAuthorisation?: boolean;
}

/**
 * Hosted-page card adapter SHELL. Card numbers and CVV never touch RideKmer: the customer is
 * redirected to the PSP page and the result arrives by webhook + server-side verification.
 */
export class CardProvider extends ProviderShell {
  readonly id: string;
  readonly method = "CARD" as const;
  readonly capabilities: PaymentProviderCapabilities;

  constructor(config: CardProviderConfig) {
    super({
      environment: config.environment,
      baseUrl: config.baseUrl,
      webhookSecret: config.webhookSecret,
      requiredCredentials: {
        CARD_PAYMENT_PUBLIC_KEY: config.publicKey,
        CARD_PAYMENT_SECRET_KEY: config.secretKey,
        CARD_PAYMENT_WEBHOOK_SECRET: config.webhookSecret,
      },
    });
    this.id = `card-${config.providerId}`;
    this.capabilities = {
      supportsPreAuthorisation: config.supportsPreAuthorisation ?? false,
      supportsRefunds: true,
      supportsPayouts: false,
      supportsWebhooks: true,
    };
  }
}
