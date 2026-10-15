import { describe, expect, it } from "vitest";

import { maskEmail, maskPhone, redact } from "@/lib/logger";

describe("log redaction", () => {
  it("redacts secret-like keys regardless of casing", () => {
    const out = redact({
      password: "x",
      Authorization: "Bearer y",
      apiKey: "z",
      otp: "123456",
      nested: { cardNumber: "4111" },
    }) as Record<string, unknown>;
    expect(out.password).toBe("[REDACTED]");
    expect(out.Authorization).toBe("[REDACTED]");
    expect(out.apiKey).toBe("[REDACTED]");
    expect(out.otp).toBe("[REDACTED]");
    expect((out.nested as Record<string, unknown>).cardNumber).toBe("[REDACTED]");
  });

  it("masks emails and phone numbers inside strings", () => {
    const out = redact("contact jean.dupont@example.com or +237 677 123 456") as string;
    expect(out).not.toContain("jean.dupont@");
    expect(out).not.toContain("677 123 456");
    expect(maskEmail("jean@example.com")).toBe("je***@example.com");
    expect(maskPhone("+237677123456")).toMatch(/\*+456$/);
  });

  it("keeps errors readable", () => {
    const out = redact(new Error("boom")) as { message: string };
    expect(out.message).toBe("boom");
  });
});
