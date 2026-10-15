import { describe, expect, it } from "vitest";

import {
  depositRetentionPostings,
  expensePostings,
  netByAccount,
  payoutPostings,
  refundPostings,
  rentalPaymentPostings,
} from "@/features/finance/postings";
import { buildStatement } from "@/features/finance/statements";

describe("ledger posting rules", () => {
  it("splits a rental payment into deposit liability, owner share, tax and revenue, and balances", () => {
    const lines = rentalPaymentPostings({
      reference: "RK-1",
      amountXaf: 205_000,
      depositXaf: 100_000,
      totalRentalXaf: 105_000,
      ownerShareXaf: 80_000,
      taxXaf: 0,
      ownerProfileId: "own1",
    });
    const net = netByAccount(lines);
    expect(net.platform_cash).toBe(-205_000);
    expect(net.customer_deposits_held).toBe(100_000);
    expect(net["owner_payable:own1"]).toBe(80_000);
    expect(net.platform_revenue).toBe(25_000);
    expect(Object.values(net).reduce((a, b) => a + b, 0)).toBe(0);
  });

  it("gives the whole rental to the platform for RideKmer-owned vehicles", () => {
    const lines = rentalPaymentPostings({
      reference: "RK-2",
      amountXaf: 150_000,
      depositXaf: 50_000,
      totalRentalXaf: 100_000,
      ownerShareXaf: 0,
      taxXaf: 5_000,
      ownerProfileId: null,
    });
    const net = netByAccount(lines);
    expect(net.platform_revenue).toBe(95_000);
    expect(net.tax_payable).toBe(5_000);
    expect(lines.some((l) => l.credit.startsWith("owner_payable:"))).toBe(false);
  });

  it("never allocates more than what was paid when the snapshot drifts", () => {
    const lines = rentalPaymentPostings({
      reference: "RK-3",
      amountXaf: 60_000,
      depositXaf: 50_000,
      totalRentalXaf: 100_000,
      ownerShareXaf: 80_000,
      taxXaf: 0,
      ownerProfileId: "own1",
    });
    const net = netByAccount(lines);
    expect(net["owner_payable:own1"]).toBe(10_000);
    expect(net.platform_revenue ?? 0).toBe(0);
  });

  it("refunds the deposit first, then shares the rental part proportionally", () => {
    const lines = refundPostings({
      reference: "RK-1",
      refundXaf: 152_500,
      depositPortionXaf: 100_000,
      ownerShareXaf: 80_000,
      totalRentalXaf: 105_000,
      ownerProfileId: "own1",
    });
    const net = netByAccount(lines);
    expect(net.customer_deposits_held).toBe(-100_000);
    expect(net["owner_payable:own1"]).toBe(-40_000); // 52 500 × 80/105
    expect(net.platform_revenue).toBe(-12_500);
    expect(net.platform_cash).toBe(152_500);
  });

  it("retains deposit deductions with the owner's share of damage and charges", () => {
    const lines = depositRetentionPostings({
      reference: "RK-1",
      retainedXaf: 60_000,
      damageXaf: 30_000,
      ownerShareBps: 8_000,
      ownerProfileId: "own1",
    });
    const net = netByAccount(lines);
    expect(net.customer_deposits_held).toBe(-60_000);
    expect(net["owner_payable:own1"]).toBe(48_000);
    expect(net.platform_revenue).toBe(12_000);
  });

  it("posts expenses and payouts against the owner payable account", () => {
    expect(
      netByAccount(
        expensePostings({
          reference: "oil",
          ownerShareXaf: 75_000,
          ridekmerShareXaf: 0,
          ownerProfileId: "own1",
        }),
      )["owner_payable:own1"],
    ).toBe(-75_000);
    expect(netByAccount(payoutPostings("PO1", "own1", 20_000))).toEqual({
      "owner_payable:own1": -20_000,
      platform_cash: 20_000,
    });
    expect(
      expensePostings({
        reference: "x",
        ownerShareXaf: 0,
        ridekmerShareXaf: 0,
        ownerProfileId: null,
      }),
    ).toEqual([]);
  });
});

describe("owner statement", () => {
  it("runs the balance and classifies lines", () => {
    const s = buildStatement(10_000, [
      {
        effectiveAt: new Date("2026-09-02T10:00:00Z"),
        type: "OWNER_EARNING",
        description: "a",
        amountXaf: 80_000,
        credit: true,
        reference: "RK-1",
      },
      {
        effectiveAt: new Date("2026-09-05T10:00:00Z"),
        type: "MAINTENANCE_DEDUCTION",
        description: "b",
        amountXaf: 15_000,
        credit: false,
        reference: null,
      },
      {
        effectiveAt: new Date("2026-09-09T10:00:00Z"),
        type: "REFUND",
        description: "c",
        amountXaf: 5_000,
        credit: false,
        reference: "RK-1",
      },
      {
        effectiveAt: new Date("2026-09-20T10:00:00Z"),
        type: "PAYOUT",
        description: "d",
        amountXaf: 50_000,
        credit: false,
        reference: null,
      },
    ]);
    expect(s.earningsXaf).toBe(80_000);
    expect(s.expensesXaf).toBe(15_000);
    expect(s.refundsXaf).toBe(5_000);
    expect(s.payoutsXaf).toBe(50_000);
    expect(s.closingBalanceXaf).toBe(20_000);
    expect(s.lines.map((l) => l.balanceXaf)).toEqual([90_000, 75_000, 70_000, 20_000]);
  });
});
