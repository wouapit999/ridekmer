import type { DeliveryResult, EmailMessage, EmailProvider } from "../types";

export interface ResendConfig {
  apiKey: string;
  /** RFC 5322 sender, e.g. `RideKmer <no-reply@ridekmer.cm>`; the domain must be verified in Resend. */
  from: string;
  apiUrl?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Resend transactional e-mail over its HTTP API (no SDK dependency). Resend only delivers
 * to arbitrary recipients once the sender domain is verified (DNS records); until then it
 * returns HTTP 403 and the Notification row records the error.
 */
export class ResendEmailProvider implements EmailProvider {
  readonly name = "resend";
  constructor(private readonly config: ResendConfig) {}

  async sendEmail(message: EmailMessage): Promise<DeliveryResult> {
    const fetchImpl = this.config.fetchImpl ?? fetch;
    try {
      const response = await fetchImpl(this.config.apiUrl ?? "https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          from: this.config.from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          ...(message.html ? { html: message.html } : {}),
          ...(message.replyTo ? { reply_to: message.replyTo } : {}),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        id?: string;
        message?: string;
        name?: string;
      };
      if (!response.ok) {
        const reason = data.message ?? data.name ?? `HTTP ${response.status}`;
        return { ok: false, provider: this.name, error: `HTTP ${response.status}: ${reason}` };
      }
      return { ok: true, provider: this.name, providerMessageId: data.id };
    } catch (error) {
      return {
        ok: false,
        provider: this.name,
        error: error instanceof Error ? error.message : "unknown",
      };
    }
  }
}
