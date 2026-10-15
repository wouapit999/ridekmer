import { describe, expect, it } from "vitest";

import {
  MemoryReplayStore,
  MockPaymentProvider,
  guardReplay,
  signPayload,
  verifyHmacSignature,
} from "@ridekmer/payments";

const base = {
  amountXaf: 50000,
  currency: "XAF" as const,
  description: "Booking RK-1",
  reference: "RK-1",
};

describe("payment provider abstraction (mock)", () => {
  it("is idempotent on initiation", async () => {
    const p = new MockPaymentProvider({ id: "mtn-mock", method: "MTN_MOBILE_MONEY" });
    const a = await p.initiatePayment({
      ...base,
      idempotencyKey: "idem-1234",
      payerPhone: "+237677123456",
    });
    const b = await p.initiatePayment({
      ...base,
      idempotencyKey: "idem-1234",
      payerPhone: "+237677123456",
    });
    expect(a.providerReference).toBe(b.providerReference);
    expect(p.capabilities.supportsPreAuthorisation).toBe(false);
    expect(p.environment).toBe("mock");
  });

  it("confirms only after customer approval and verifies the amount", async () => {
    const p = new MockPaymentProvider({ id: "om-mock", method: "ORANGE_MONEY" });
    const init = await p.initiatePayment({
      ...base,
      idempotencyKey: "idem-2222",
      payerPhone: "+237699123456",
    });
    expect((await p.getPaymentStatus(init.providerReference)).status).toBe(
      "REQUIRES_CUSTOMER_ACTION",
    );
    p.simulateCustomerApproval(init.providerReference);
    expect((await p.verifyTransaction(init.providerReference, 50000)).status).toBe("SUCCESSFUL");
    expect((await p.verifyTransaction(init.providerReference, 49999)).failureCode).toBe(
      "AMOUNT_MISMATCH",
    );
    const recon = await p.reconcileTransaction({
      providerReference: init.providerReference,
      expectedAmountXaf: 50000,
    });
    expect(recon.matches).toBe(true);
  });

  it("fails deterministically for configured phone suffixes", async () => {
    const p = new MockPaymentProvider({ id: "mtn-mock", method: "MTN_MOBILE_MONEY" });
    const init = await p.initiatePayment({
      ...base,
      idempotencyKey: "idem-3333",
      payerPhone: "+237677000000",
    });
    expect(p.simulateCustomerApproval(init.providerReference).status).toBe("FAILED");
  });

  it("validates webhook signatures and ignores forged payloads", async () => {
    const p = new MockPaymentProvider({
      id: "mtn-mock",
      method: "MTN_MOBILE_MONEY",
      webhookSecret: "s3cret",
    });
    const init = await p.initiatePayment({
      ...base,
      idempotencyKey: "idem-4444",
      payerPhone: "+237677123456",
    });
    const good = p.buildWebhook(init.providerReference, "SUCCESSFUL");
    expect((await p.processWebhook(good)).signatureValid).toBe(true);
    const forged = { ...good, headers: { "x-mock-signature": "sha256=deadbeef" } };
    const result = await p.processWebhook(forged);
    expect(result.signatureValid).toBe(false);
  });

  it("refunds at most the captured amount, idempotently", async () => {
    const p = new MockPaymentProvider({ id: "card-mock", method: "CARD" });
    const init = await p.initiatePayment({
      ...base,
      idempotencyKey: "idem-5555",
      returnUrl: "https://example.com/return",
    });
    p.simulateCustomerApproval(init.providerReference);
    const r1 = await p.initiateRefund({
      idempotencyKey: "rf-1",
      providerReference: init.providerReference,
      amountXaf: 20000,
      reason: "partial",
    });
    const r2 = await p.initiateRefund({
      idempotencyKey: "rf-1",
      providerReference: init.providerReference,
      amountXaf: 20000,
      reason: "partial",
    });
    expect(r1.providerRefundReference).toBe(r2.providerRefundReference);
    expect((await p.getPaymentStatus(init.providerReference)).status).toBe("PARTIALLY_REFUNDED");
    await expect(
      p.initiateRefund({
        idempotencyKey: "rf-2",
        providerReference: init.providerReference,
        amountXaf: 40000,
        reason: "too much",
      }),
    ).rejects.toThrow();
  });
});

describe("webhook security helpers", () => {
  it("verifies HMAC signatures in constant time", () => {
    const sig = signPayload("{}", "k");
    expect(verifyHmacSignature("{}", "k", sig)).toBe(true);
    expect(verifyHmacSignature("{}", "k", "sha256=00")).toBe(false);
    expect(verifyHmacSignature("{}", "k", undefined)).toBe(false);
  });

  it("rejects replayed and stale events", async () => {
    const store = new MemoryReplayStore();
    const now = new Date("2026-10-15T10:00:00Z");
    expect(await guardReplay(store, "evt-1", now, 300, now)).toEqual({ ok: true });
    expect(await guardReplay(store, "evt-1", now, 300, now)).toEqual({
      ok: false,
      reason: "DUPLICATE",
    });
    expect(await guardReplay(store, "evt-2", new Date("2026-10-15T09:00:00Z"), 300, now)).toEqual({
      ok: false,
      reason: "STALE",
    });
  });
});
