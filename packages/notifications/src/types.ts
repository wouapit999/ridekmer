import { z } from "zod";

export const notificationChannels = ["EMAIL", "SMS", "WHATSAPP", "IN_APP", "PUSH"] as const;
export type NotificationChannel = (typeof notificationChannels)[number];

export const localeSchema = z.enum(["fr", "en"]);
export type Locale = z.infer<typeof localeSchema>;

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}

export interface SmsMessage {
  to: string; // E.164
  text: string;
}

export interface WhatsAppMessage {
  to: string; // E.164
  templateName?: string;
  text: string;
  variables?: Record<string, string>;
}

export interface PushMessage {
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
  title: string;
  body: string;
  url?: string;
}

export interface DeliveryResult {
  ok: boolean;
  provider: string;
  providerMessageId?: string;
  error?: string;
  /** True when the message was only logged (development / mock mode). */
  simulated?: boolean;
}

export interface EmailProvider {
  readonly name: string;
  sendEmail(message: EmailMessage): Promise<DeliveryResult>;
}

export interface SmsProvider {
  readonly name: string;
  sendSms(message: SmsMessage): Promise<DeliveryResult>;
}

export interface WhatsAppProvider {
  readonly name: string;
  sendWhatsApp(message: WhatsAppMessage): Promise<DeliveryResult>;
}

export interface PushProvider {
  readonly name: string;
  sendPush(message: PushMessage): Promise<DeliveryResult>;
}
