import nodemailer, { type Transporter } from "nodemailer";

import type { DeliveryResult, EmailMessage, EmailProvider } from "../types";

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  /** RFC 5322 sender; most providers require it to match the authenticated mailbox. */
  from: string;
  /** Implicit TLS (port 465). STARTTLS is negotiated automatically on 587. */
  secure?: boolean;
}

/** Minimal transport surface so tests can inject a fake without a network. */
export interface SmtpTransport {
  sendMail(options: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html?: string;
    replyTo?: string;
  }): Promise<{ messageId?: string }>;
}

/**
 * SMTP delivery through nodemailer — works with Google Workspace, Microsoft 365, OVH, Zoho
 * or any transactional SMTP relay. Credentials come from the environment only.
 */
export class SmtpEmailProvider implements EmailProvider {
  readonly name = "smtp";
  private readonly transport: SmtpTransport;

  constructor(
    private readonly config: SmtpConfig,
    transport?: SmtpTransport,
  ) {
    this.transport =
      transport ??
      (nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure ?? config.port === 465,
        auth: { user: config.user, pass: config.password },
      }) as Transporter);
  }

  async sendEmail(message: EmailMessage): Promise<DeliveryResult> {
    try {
      const info = await this.transport.sendMail({
        from: this.config.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
        ...(message.replyTo ? { replyTo: message.replyTo } : {}),
      });
      return { ok: true, provider: this.name, providerMessageId: info.messageId };
    } catch (error) {
      return {
        ok: false,
        provider: this.name,
        error: error instanceof Error ? error.message : "unknown",
      };
    }
  }
}
