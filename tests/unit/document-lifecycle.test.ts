import { describe, expect, it } from "vitest";

import {
  alertThresholdDue,
  canTransition,
  daysUntilExpiry,
  evaluateVehicleCompliance,
  isExpired,
  type DocumentLike,
} from "@/features/documents/lifecycle";

const type = {
  key: "motor_insurance_certificate",
  isMandatory: true,
  requiresExpiry: true,
  blocksVehicleWhenExpired: true,
  alertDaysBefore: [60, 30, 14, 7, 0],
};
const now = new Date("2026-10-15T10:00:00.000Z");
const doc = (
  daysAhead: number,
  lastAlert: number | null = null,
  status: DocumentLike["status"] = "VERIFIED",
): DocumentLike => ({
  status,
  expiryDate: new Date(now.getTime() + daysAhead * 86_400_000),
  lastAlertDaysBefore: lastAlert,
  documentType: type,
});

describe("document expiry alerts", () => {
  it("counts calendar days in Douala", () => {
    expect(daysUntilExpiry(new Date("2026-10-20T00:00:00.000Z"), now)).toBe(5);
    expect(daysUntilExpiry(new Date("2026-10-14T23:30:00.000Z"), now)).toBe(0); // 00:30 on the 15th in Douala
  });

  it("fires the configured thresholds once each, in descending order", () => {
    expect(alertThresholdDue(doc(75), now)).toBeNull();
    expect(alertThresholdDue(doc(60), now)).toBe(60);
    expect(alertThresholdDue(doc(45, 60), now)).toBeNull();
    expect(alertThresholdDue(doc(30, 60), now)).toBe(30);
    expect(alertThresholdDue(doc(10, 30), now)).toBe(14);
    expect(alertThresholdDue(doc(7, 14), now)).toBe(7);
    expect(alertThresholdDue(doc(0, 7), now)).toBe(0);
    expect(alertThresholdDue(doc(0, 0), now)).toBeNull();
  });

  it("skips thresholds that were missed and sends the smallest applicable one", () => {
    expect(alertThresholdDue(doc(5), now)).toBe(7);
  });

  it("ignores non-verified documents and expired ones", () => {
    expect(alertThresholdDue(doc(10, null, "SUBMITTED"), now)).toBeNull();
    expect(alertThresholdDue(doc(-1), now)).toBeNull();
    expect(isExpired(doc(-1), now)).toBe(true);
    expect(isExpired(doc(0), now)).toBe(false);
  });
});

describe("document review transitions", () => {
  it("allows only the documented transitions", () => {
    expect(canTransition("SUBMITTED", "VERIFIED")).toBe(true);
    expect(canTransition("SUBMITTED", "REJECTED")).toBe(true);
    expect(canTransition("VERIFIED", "REJECTED")).toBe(false);
    expect(canTransition("REPLACED", "VERIFIED")).toBe(false);
    expect(canTransition("DRAFT", "VERIFIED")).toBe(false);
  });
});

describe("vehicle document compliance", () => {
  const mandatory = [
    { key: "motor_insurance_certificate", blocksVehicleWhenExpired: true },
    { key: "proof_of_ownership", blocksVehicleWhenExpired: false },
  ];
  const d = (key: string, status: DocumentLike["status"], daysAhead: number | null) => ({
    status,
    expiryDate: daysAhead === null ? null : new Date(now.getTime() + daysAhead * 86_400_000),
    documentType: { key },
  });

  it("requires every mandatory type to be verified", () => {
    const result = evaluateVehicleCompliance(
      mandatory,
      [d("motor_insurance_certificate", "VERIFIED", 100)],
      now,
    );
    expect(result.valid).toBe(false);
    expect(result.missing).toEqual(["proof_of_ownership"]);
  });

  it("is valid when all mandatory documents are verified and current", () => {
    const result = evaluateVehicleCompliance(
      mandatory,
      [
        d("motor_insurance_certificate", "VERIFIED", 100),
        d("proof_of_ownership", "VERIFIED", null),
      ],
      now,
    );
    expect(result).toEqual({ valid: true, missing: [], expired: [] });
  });

  it("blocks the vehicle when a blocking document is expired, unless an active override exists", () => {
    const docs = [
      d("motor_insurance_certificate", "VERIFIED", -2),
      d("proof_of_ownership", "VERIFIED", null),
    ];
    expect(evaluateVehicleCompliance(mandatory, docs, now).valid).toBe(false);
    expect(evaluateVehicleCompliance(mandatory, docs, now).expired).toEqual([
      "motor_insurance_certificate",
    ]);
    expect(
      evaluateVehicleCompliance(mandatory, docs, now, {
        expiresAt: new Date(now.getTime() + 86_400_000),
        revokedAt: null,
      }).valid,
    ).toBe(true);
    expect(
      evaluateVehicleCompliance(mandatory, docs, now, {
        expiresAt: new Date(now.getTime() - 1),
        revokedAt: null,
      }).valid,
    ).toBe(false);
    expect(
      evaluateVehicleCompliance(mandatory, docs, now, {
        expiresAt: new Date(now.getTime() + 86_400_000),
        revokedAt: now,
      }).valid,
    ).toBe(false);
  });

  it("treats a document marked EXPIRED as expired (override applies), not as missing", () => {
    const docs = [
      d("motor_insurance_certificate", "EXPIRED", -2),
      d("proof_of_ownership", "VERIFIED", null),
    ];
    const result = evaluateVehicleCompliance(mandatory, docs, now);
    expect(result.missing).toEqual([]);
    expect(result.expired).toEqual(["motor_insurance_certificate"]);
    expect(
      evaluateVehicleCompliance(mandatory, docs, now, {
        expiresAt: new Date(now.getTime() + 86_400_000),
        revokedAt: null,
      }).valid,
    ).toBe(true);
  });

  it("uses the newest verified version when an older one is expired", () => {
    const docs = [
      d("motor_insurance_certificate", "VERIFIED", -10),
      d("motor_insurance_certificate", "VERIFIED", 200),
      d("proof_of_ownership", "VERIFIED", null),
    ];
    expect(evaluateVehicleCompliance(mandatory, docs, now).valid).toBe(true);
  });
});
