import type {
  DeliveryResult,
  EmailMessage,
  EmailProvider,
  PushMessage,
  PushProvider,
  SmsMessage,
  SmsProvider,
  WhatsAppMessage,
  WhatsAppProvider,
} from "../types";

type Sink = (entry: Record<string, unknown>) => void;

const defaultSink: Sink = (entry) => {
  console.info(JSON.stringify({ level: "info", msg: "[DEV LOG PROVIDER] notification", ...entry }));
};

function mask(value: string): string {
  if (value.includes("@")) {
    const [l, d] = value.split("@");
    return `${(l ?? "").slice(0, 2)}***@${d}`;
  }
  const digits = value.replace(/\D/g, "");
  return `***${digits.slice(-3)}`;
}

/**
 * Development-only provider: writes a redacted line to the log instead of sending anything.
 * OTP codes are intentionally NOT logged; tests use MemoryNotificationProvider to read them.
 */
export class LogNotificationProvider
  implements EmailProvider, SmsProvider, WhatsAppProvider, PushProvider
{
  readonly name = "log";
  constructor(private readonly sink: Sink = defaultSink) {}

  private record(channel: string, to: string, summary: string): DeliveryResult {
    this.sink({ channel, to: mask(to), summary, simulated: true });
    return {
      ok: true,
      provider: this.name,
      simulated: true,
      providerMessageId: `log-${Date.now()}`,
    };
  }

  async sendEmail(message: EmailMessage): Promise<DeliveryResult> {
    return this.record("EMAIL", message.to, message.subject);
  }

  async sendSms(message: SmsMessage): Promise<DeliveryResult> {
    return this.record("SMS", message.to, `${message.text.length} chars`);
  }

  async sendWhatsApp(message: WhatsAppMessage): Promise<DeliveryResult> {
    return this.record(
      "WHATSAPP",
      message.to,
      message.templateName ?? `${message.text.length} chars`,
    );
  }

  async sendPush(message: PushMessage): Promise<DeliveryResult> {
    return this.record("PUSH", message.subscription.endpoint, message.title);
  }
}

/** In-memory capture used by automated tests to assert on sent messages (never in production). */
export class MemoryNotificationProvider
  implements EmailProvider, SmsProvider, WhatsAppProvider, PushProvider
{
  readonly name = "memory";
  readonly emails: EmailMessage[] = [];
  readonly sms: SmsMessage[] = [];
  readonly whatsapp: WhatsAppMessage[] = [];
  readonly push: PushMessage[] = [];

  async sendEmail(message: EmailMessage): Promise<DeliveryResult> {
    this.emails.push(message);
    return { ok: true, provider: this.name, simulated: true };
  }
  async sendSms(message: SmsMessage): Promise<DeliveryResult> {
    this.sms.push(message);
    return { ok: true, provider: this.name, simulated: true };
  }
  async sendWhatsApp(message: WhatsAppMessage): Promise<DeliveryResult> {
    this.whatsapp.push(message);
    return { ok: true, provider: this.name, simulated: true };
  }
  async sendPush(message: PushMessage): Promise<DeliveryResult> {
    this.push.push(message);
    return { ok: true, provider: this.name, simulated: true };
  }
  clear() {
    this.emails.length = 0;
    this.sms.length = 0;
    this.whatsapp.length = 0;
    this.push.length = 0;
  }
}
