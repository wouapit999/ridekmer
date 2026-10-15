import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  getProviderConfigViews,
  runProviderValidation,
  saveProviderConfig,
} from "@/features/payments/provider-config";
import { db } from "@/server/db";
import {
  getPaymentProvider,
  listAvailableMethods,
  resetPaymentRegistry,
} from "@/server/payments/registry";

let adminId: string;

beforeAll(async () => {
  const admin = await db.user.create({
    data: { email: `cfg-admin-${randomUUID()}@ridekmer.test`, name: "Config Admin" },
  });
  adminId = admin.id;
  await db.paymentProviderConfig.deleteMany({ where: { provider: "ORANGE_MONEY" } });
  resetPaymentRegistry();
});

afterAll(async () => {
  // Leave the provider in mock mode for the other suites.
  await db.paymentProviderConfig.deleteMany({ where: { provider: "ORANGE_MONEY" } });
  resetPaymentRegistry();
  await db.$disconnect();
});

describe("admin payment provider configuration", () => {
  it("stores credentials encrypted, never exposes them, and drives the registry", async () => {
    expect((await getPaymentProvider("ORANGE_MONEY")).environment).toBe("mock");

    await saveProviderConfig({
      provider: "ORANGE_MONEY",
      enabled: true,
      environment: "sandbox",
      baseUrl: "https://sandbox.orange.example.invalid",
      credentials: {
        ORANGE_MONEY_CLIENT_ID: "client-id",
        ORANGE_MONEY_CLIENT_SECRET: "top-secret-value",
        ORANGE_MONEY_MERCHANT_KEY: "merchant",
        ORANGE_MONEY_WEBHOOK_SECRET: "hook",
      },
      actorId: adminId,
    });
    const row = await db.paymentProviderConfig.findUniqueOrThrow({
      where: { provider: "ORANGE_MONEY" },
    });
    expect(row.credentialsEnc).not.toContain("top-secret-value");
    expect(row.credentialFields).toHaveLength(4);
    const audit = await db.auditLog.findFirst({
      where: { action: "payment_provider.configure", entityId: row.id },
      orderBy: { createdAt: "desc" },
    });
    expect(JSON.stringify(audit?.after)).not.toContain("top-secret-value");

    const view = (await getProviderConfigViews()).find((v) => v.key === "ORANGE_MONEY")!;
    expect(view.source).toBe("database");
    expect(view.fields.every((f) => f.set && f.fromDatabase)).toBe(true);
    expect(JSON.stringify(view)).not.toContain("top-secret-value");
    expect(view.validation.code).toBe("OK_SHELL");

    resetPaymentRegistry();
    const provider = await getPaymentProvider("ORANGE_MONEY");
    expect(provider.environment).toBe("sandbox");
    await expect(
      provider.initiatePayment({
        idempotencyKey: "idem-cfg-1",
        amountXaf: 1000,
        currency: "XAF",
        description: "x",
        reference: "RK-X",
      }),
    ).rejects.toMatchObject({ code: "NOT_IMPLEMENTED" });
    expect((await runProviderValidation("ORANGE_MONEY", adminId)).code).toBe("OK_SHELL");

    // Clearing a credential makes the configuration incomplete and the method unavailable.
    await saveProviderConfig({
      provider: "ORANGE_MONEY",
      enabled: true,
      environment: "sandbox",
      baseUrl: "https://sandbox.orange.example.invalid",
      credentials: { ORANGE_MONEY_CLIENT_SECRET: "__clear__" },
      actorId: adminId,
    });
    resetPaymentRegistry();
    const methods = await listAvailableMethods();
    expect(methods.some((m) => m.method === "ORANGE_MONEY")).toBe(false);
    expect(methods.some((m) => m.method === "MTN_MOBILE_MONEY")).toBe(true);

    // Disabling hides it too; back to mock restores the simulation.
    await saveProviderConfig({
      provider: "ORANGE_MONEY",
      enabled: false,
      environment: "mock",
      credentials: {},
      actorId: adminId,
    });
    resetPaymentRegistry();
    expect((await listAvailableMethods()).some((m) => m.method === "ORANGE_MONEY")).toBe(false);
    await saveProviderConfig({
      provider: "ORANGE_MONEY",
      enabled: true,
      environment: "mock",
      credentials: {},
      actorId: adminId,
    });
    resetPaymentRegistry();
    expect((await getPaymentProvider("ORANGE_MONEY")).environment).toBe("mock");
  });
});
