import { ManualPaymentProvider, isManualProviderId } from "@ridekmer/payments";
import { describe, expect, it } from "vitest";

import { whatsappChatLink } from "@/features/payments/whatsapp";

describe("manual Mobile Money", () => {
  it("gives each hand-made method its own manual provider id", async () => {
    const mtn = new ManualPaymentProvider({
      method: "MTN_MOBILE_MONEY",
      customerInstruction: { fr: "Envoyez au +237677550803", en: "Send to +237677550803" },
      expiryHours: 24,
    });
    expect(mtn.id).toBe("manual-mtn-momo");
    expect(mtn.instructionFor("en")).toBe("Send to +237677550803");
    expect(
      new ManualPaymentProvider({
        method: "ORANGE_MONEY",
        customerInstruction: { fr: "", en: "" },
      }).id,
    ).toBe("manual-orange-money");
    const init = await mtn.initiatePayment({
      idempotencyKey: "k",
      amountXaf: 1000,
      currency: "XAF",
      description: "d",
      reference: "RK-1",
    });
    expect(init.status).toBe("PENDING");
    expect(init.expiresAt!.getTime() - Date.now()).toBeGreaterThan(23 * 3_600_000);
    expect(isManualProviderId("manual-mtn-momo")).toBe(true);
    expect(isManualProviderId("mock-mtn-momo")).toBe(false);
  });

  it("builds a WhatsApp click-to-chat link with the message prefilled", () => {
    const link = whatsappChatLink("+258 87 827 5656", "Booking RK-1\nID: 123 & co");
    expect(link).toBe("https://wa.me/258878275656?text=Booking%20RK-1%0AID%3A%20123%20%26%20co");
  });
});
