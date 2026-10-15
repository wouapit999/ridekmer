import { PaymentProviderError, notImplemented } from "../errors";
import type {
  InitiatePaymentInput,
  InitiatePaymentResult,
  InitiatePayoutInput,
  InitiateRefundInput,
  PaymentMethod,
  PaymentProvider,
  PaymentProviderCapabilities,
  PaymentStatusResult,
  PayoutResult,
  ReconcileInput,
  ReconcileResult,
  RefundResult,
  WebhookRequest,
  WebhookResult,
} from "../types";

export interface ProviderShellConfig {
  environment: "sandbox" | "production";
  /** Base URL published by the provider for the chosen environment. */
  baseUrl?: string;
  /** Secret used to verify provider callbacks. */
  webhookSecret?: string;
  /** Names of the credential fields that must be present before the provider can be enabled. */
  requiredCredentials: Record<string, string | undefined>;
}

/**
 * Base class for real-provider adapters. It validates configuration up-front and refuses to
 * run any operation until the adapter has been implemented against the provider's official
 * documentation. No endpoint, payload or behaviour of a real provider is guessed here.
 */
export abstract class ProviderShell implements PaymentProvider {
  abstract readonly id: string;
  abstract readonly method: PaymentMethod;
  abstract readonly capabilities: PaymentProviderCapabilities;
  readonly environment: "sandbox" | "production";
  protected readonly baseUrl?: string;
  protected readonly webhookSecret?: string;

  protected constructor(config: ProviderShellConfig) {
    const missing = Object.entries(config.requiredCredentials)
      .filter(([, value]) => !value)
      .map(([name]) => name);
    if (!config.baseUrl) missing.push("baseUrl");
    if (missing.length > 0) {
      throw new PaymentProviderError(
        "NOT_CONFIGURED",
        `Missing configuration: ${missing.join(", ")}`,
      );
    }
    this.environment = config.environment;
    this.baseUrl = config.baseUrl;
    this.webhookSecret = config.webhookSecret;
  }

  initiatePayment(_input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    return Promise.reject(notImplemented(this.id, "initiatePayment"));
  }
  getPaymentStatus(_providerReference: string): Promise<PaymentStatusResult> {
    return Promise.reject(notImplemented(this.id, "getPaymentStatus"));
  }
  verifyTransaction(_ref: string, _expectedAmountXaf: number): Promise<PaymentStatusResult> {
    return Promise.reject(notImplemented(this.id, "verifyTransaction"));
  }
  processWebhook(_request: WebhookRequest): Promise<WebhookResult> {
    return Promise.reject(notImplemented(this.id, "processWebhook"));
  }
  initiateRefund(_input: InitiateRefundInput): Promise<RefundResult> {
    return Promise.reject(notImplemented(this.id, "initiateRefund"));
  }
  getRefundStatus(_ref: string): Promise<RefundResult> {
    return Promise.reject(notImplemented(this.id, "getRefundStatus"));
  }
  reconcileTransaction(_input: ReconcileInput): Promise<ReconcileResult> {
    return Promise.reject(notImplemented(this.id, "reconcileTransaction"));
  }
  initiatePayout(_input: InitiatePayoutInput): Promise<PayoutResult> {
    return Promise.reject(notImplemented(this.id, "initiatePayout"));
  }
  getPayoutStatus(_ref: string): Promise<PayoutResult> {
    return Promise.reject(notImplemented(this.id, "getPayoutStatus"));
  }
}
