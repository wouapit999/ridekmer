import { describe, expect, it, vi } from "vitest";

import {
  ResendEmailProvider,
  SmtpEmailProvider,
  findTemplate,
  renderTemplate,
  type SmtpTransport,
} from "@ridekmer/notifications";

const message = { to: "ops@example.com", subject: "Hello", text: "Body" };

describe("ResendEmailProvider", () => {
  it("posts to the Resend API with the bearer key and returns the message id", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.from).toBe("RideKmer <no-reply@example.com>");
      expect(body.to).toEqual(["ops@example.com"]);
      expect((init?.headers as Record<string, string>).authorization).toBe("Bearer re_test");
      return new Response(JSON.stringify({ id: "msg_1" }), { status: 200 });
    });
    const provider = new ResendEmailProvider({
      apiKey: "re_test",
      from: "RideKmer <no-reply@example.com>",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const result = await provider.sendEmail(message);
    expect(result).toMatchObject({ ok: true, provider: "resend", providerMessageId: "msg_1" });
  });

  it("reports an unverified domain as a failed delivery instead of throwing", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ name: "validation_error", message: "Domain not verified" }), {
          status: 403,
        }),
    );
    const provider = new ResendEmailProvider({
      apiKey: "re_test",
      from: "RideKmer <no-reply@example.com>",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const result = await provider.sendEmail(message);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("403");
    expect(result.error).toContain("Domain not verified");
  });

  it("turns a network error into a failed delivery", async () => {
    const provider = new ResendEmailProvider({
      apiKey: "re_test",
      from: "RideKmer <no-reply@example.com>",
      fetchImpl: (async () => {
        throw new Error("ECONNRESET");
      }) as unknown as typeof fetch,
    });
    const result = await provider.sendEmail(message);
    expect(result).toMatchObject({ ok: false, provider: "resend", error: "ECONNRESET" });
  });
});

describe("SmtpEmailProvider", () => {
  const config = {
    host: "smtp.example.com",
    port: 587,
    user: "mailer",
    password: "secret",
    from: "RideKmer <no-reply@example.com>",
  };

  it("sends through the injected transport with the configured sender", async () => {
    const sendMail = vi.fn(async () => ({ messageId: "<abc@example.com>" }));
    const transport: SmtpTransport = { sendMail };
    const provider = new SmtpEmailProvider(config, transport);
    const result = await provider.sendEmail({ ...message, replyTo: "support@example.com" });
    expect(result).toMatchObject({
      ok: true,
      provider: "smtp",
      providerMessageId: "<abc@example.com>",
    });
    expect(sendMail).toHaveBeenCalledWith({
      from: config.from,
      to: "ops@example.com",
      subject: "Hello",
      text: "Body",
      replyTo: "support@example.com",
    });
  });

  it("returns the transport error without throwing", async () => {
    const transport: SmtpTransport = {
      sendMail: async () => {
        throw new Error("535 Authentication failed");
      },
    };
    const result = await new SmtpEmailProvider(config, transport).sendEmail(message);
    expect(result).toMatchObject({ ok: false, error: "535 Authentication failed" });
  });
});

describe("administrator templates", () => {
  it("exist in both locales and carry the temporary password only in the credentials mail", () => {
    const credentials = findTemplate("admin_credentials");
    const granted = findTemplate("admin_role_granted");
    expect(credentials?.email?.fr.subject).toBeTruthy();
    expect(credentials?.email?.en.subject).toBeTruthy();
    expect(granted?.email?.fr.body).not.toContain("{{password}}");
    const body = renderTemplate(credentials!.email!.en.body, {
      name: "Ops",
      email: "ops@example.com",
      password: "Temp-Pass",
      url: "https://app.example.com/en/login",
    });
    expect(body).toContain("Temp-Pass");
    expect(body).toContain("https://app.example.com/en/login");
    expect(body).toMatch(/two-factor/i);
  });
});
