import type { DeliveryResult, SmsMessage, SmsProvider } from "../types";

export interface GenericHttpSmsConfig {
  apiUrl: string;
  apiKey: string;
  senderId: string;
  /** Custom body builder for the chosen aggregator. */
  buildBody?: (message: SmsMessage, senderId: string) => Record<string, unknown>;
  fetchImpl?: typeof fetch;
}

/**
 * Integration shell for an HTTP SMS aggregator (to be pointed at the Cameroon aggregator
 * selected by the business). The request shape is configurable; nothing here assumes a
 * specific vendor's API. Status: NOT ACTIVATED until credentials exist (docs/OPEN_ITEMS.md).
 */
export class GenericHttpSmsProvider implements SmsProvider {
  readonly name = "generic-http";
  constructor(private readonly config: GenericHttpSmsConfig) {}

  async sendSms(message: SmsMessage): Promise<DeliveryResult> {
    const fetchImpl = this.config.fetchImpl ?? fetch;
    const body = this.config.buildBody?.(message, this.config.senderId) ?? {
      to: message.to,
      from: this.config.senderId,
      text: message.text,
    };
    try {
      const response = await fetchImpl(this.config.apiUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        return { ok: false, provider: this.name, error: `HTTP ${response.status}` };
      }
      const data = (await response.json().catch(() => ({}))) as { id?: string; messageId?: string };
      return { ok: true, provider: this.name, providerMessageId: data.id ?? data.messageId };
    } catch (error) {
      return {
        ok: false,
        provider: this.name,
        error: error instanceof Error ? error.message : "unknown",
      };
    }
  }
}
