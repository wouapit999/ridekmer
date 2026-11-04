import {
  GenericHttpSmsProvider,
  LogNotificationProvider,
  ResendEmailProvider,
  SmtpEmailProvider,
  findTemplate,
  renderTemplate,
  type EmailProvider,
  type Locale,
  type SmsProvider,
  type WhatsAppProvider,
} from "@ridekmer/notifications";

import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { db } from "@/server/db";

/**
 * Notification dispatch. Providers are resolved from the environment; when no real provider
 * is configured the development log provider is used and the Notification row is flagged
 * with provider "log" so operators can see nothing was actually sent.
 */
const logProvider = new LogNotificationProvider();

let emailProvider: EmailProvider | null = null;

/**
 * Resolve the e-mail provider once per process. `resend` needs RESEND_API_KEY and `smtp`
 * needs SMTP_HOST/USER/PASSWORD; anything incomplete falls back to the log provider and is
 * reported by /api/health (`email:log`). Credentials never leave the environment.
 */
export function getEmailProvider(): EmailProvider {
  if (emailProvider) return emailProvider;
  const env = getEnv();
  emailProvider = logProvider;
  if (env.EMAIL_PROVIDER === "resend" && env.RESEND_API_KEY) {
    emailProvider = new ResendEmailProvider({ apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM });
  } else if (env.EMAIL_PROVIDER === "smtp" && env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD) {
    emailProvider = new SmtpEmailProvider({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT ?? 587,
      user: env.SMTP_USER,
      password: env.SMTP_PASSWORD,
      from: env.EMAIL_FROM,
    });
  } else if (env.EMAIL_PROVIDER !== "log") {
    logger.warn("notifications.email_provider_incomplete", { provider: env.EMAIL_PROVIDER });
  }
  return emailProvider;
}

/** True when e-mails are really delivered (not only logged). */
export function emailDeliveryConfigured(): boolean {
  return getEmailProvider().name !== "log";
}

/** Tests only: forget the cached provider so a changed environment is re-read. */
export function resetNotificationProviders() {
  emailProvider = null;
}

export function getSmsProvider(): SmsProvider {
  const env = getEnv();
  if (env.SMS_PROVIDER === "generic-http" && env.SMS_API_URL && env.SMS_API_KEY) {
    return new GenericHttpSmsProvider({
      apiUrl: env.SMS_API_URL,
      apiKey: env.SMS_API_KEY,
      senderId: env.SMS_SENDER_ID,
    });
  }
  return logProvider;
}

export function getWhatsAppProvider(): WhatsAppProvider {
  return logProvider;
}

interface SendTemplatedInput {
  templateKey: string;
  channel: "EMAIL" | "SMS" | "WHATSAPP" | "IN_APP";
  locale: Locale;
  to: string;
  userId?: string | null;
  variables: Record<string, string | number>;
  entityType?: string;
  entityId?: string;
  dedupeKey?: string;
  /** When true (OTP), the rendered body is not persisted. */
  sensitive?: boolean;
  /** Already-rendered content (housekeeping retries); skips template resolution. */
  prerendered?: { subject?: string; body: string };
  /** Set to false to send without creating a Notification row (retries update the original). */
  persist?: boolean;
  /**
   * E-mails to a known user are also listed under their notification bell when the template
   * has an in-app version. Set to false when the caller records the in-app copy itself.
   */
  mirrorInApp?: boolean;
}

async function resolveTemplate(
  key: string,
  channel: SendTemplatedInput["channel"],
  locale: Locale,
) {
  const fromDb = await db.notificationTemplate
    .findUnique({ where: { key_channel_locale: { key, channel, locale } } })
    .catch(() => null);
  if (fromDb?.isActive) return { subject: fromDb.subject ?? undefined, body: fromDb.body };
  const def = findTemplate(key);
  if (!def) throw new Error(`Unknown notification template ${key}`);
  if (channel === "EMAIL" && def.email) return def.email[locale];
  if (channel === "SMS" && def.sms) return { body: def.sms[locale] };
  if (channel === "WHATSAPP" && (def.sms ?? def.inApp))
    return { body: def.sms?.[locale] ?? def.inApp![locale].body };
  if (channel === "IN_APP" && def.inApp)
    return { subject: def.inApp[locale].title, body: def.inApp[locale].body };
  throw new Error(`Template ${key} has no ${channel} variant`);
}

export async function sendTemplatedNotification(input: SendTemplatedInput) {
  const template =
    input.prerendered ?? (await resolveTemplate(input.templateKey, input.channel, input.locale));
  const subject = input.prerendered
    ? input.prerendered.subject
    : template.subject
      ? renderTemplate(template.subject, input.variables)
      : undefined;
  const body = input.prerendered
    ? input.prerendered.body
    : renderTemplate(template.body, input.variables);

  let result: { ok: boolean; provider: string; providerMessageId?: string; error?: string } = {
    ok: true,
    provider: "in-app",
  };
  if (input.channel === "EMAIL") {
    result = await getEmailProvider().sendEmail({
      to: input.to,
      subject: subject ?? "RideKmer",
      text: body,
    });
  } else if (input.channel === "SMS") {
    result = await getSmsProvider().sendSms({ to: input.to, text: body });
  } else if (input.channel === "WHATSAPP") {
    result = await getWhatsAppProvider().sendWhatsApp({ to: input.to, text: body });
  }

  if (input.persist === false) return result;
  try {
    await db.notification.create({
      data: {
        userId: input.userId ?? undefined,
        channel: input.channel,
        templateKey: input.templateKey,
        locale: input.locale,
        recipient: input.sensitive ? undefined : input.to,
        subject: input.sensitive ? undefined : subject,
        body: input.sensitive ? "[sensitive content not stored]" : body,
        status: result.ok ? "SENT" : "FAILED",
        provider: result.provider,
        providerMessageId: result.providerMessageId,
        error: result.error,
        entityType: input.entityType,
        entityId: input.entityId,
        dedupeKey: input.dedupeKey,
        sentAt: result.ok ? new Date() : undefined,
      },
    });
  } catch (error) {
    // A duplicate dedupeKey is expected when a job retries; anything else is logged.
    logger.warn("notification.persist_failed", { templateKey: input.templateKey, error });
  }
  if (
    input.channel === "EMAIL" &&
    input.userId &&
    !input.sensitive &&
    !input.prerendered &&
    input.mirrorInApp !== false
  )
    await mirrorInApp(input);
  return result;
}

/** In-app copy of an e-mail, so the user also finds it under the notification bell. */
async function mirrorInApp(input: SendTemplatedInput) {
  let template: { subject?: string; body: string };
  try {
    template = await resolveTemplate(input.templateKey, "IN_APP", input.locale);
  } catch {
    return; // No in-app version of this template.
  }
  await db.notification
    .create({
      data: {
        userId: input.userId,
        channel: "IN_APP",
        templateKey: input.templateKey,
        locale: input.locale,
        recipient: input.to,
        subject: template.subject ? renderTemplate(template.subject, input.variables) : undefined,
        body: renderTemplate(template.body, input.variables),
        status: "SENT",
        provider: "in-app",
        entityType: input.entityType,
        entityId: input.entityId,
        dedupeKey: input.dedupeKey ? `${input.dedupeKey}:in-app` : undefined,
        sentAt: new Date(),
      },
    })
    .catch((error: unknown) =>
      logger.warn("notification.mirror_failed", { templateKey: input.templateKey, error }),
    );
}
