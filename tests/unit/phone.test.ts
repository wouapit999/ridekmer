import { describe, expect, it } from "vitest";

import { isValidCameroonMobile, maskPhoneForDisplay, parsePhone } from "@/lib/phone";

describe("phone", () => {
  it("normalises Cameroon mobiles with or without country code", () => {
    expect(parsePhone("6 77 12 34 56")?.e164).toBe("+237677123456");
    expect(parsePhone("+237 655 12 34 56")?.e164).toBe("+237655123456");
    expect(parsePhone("00237 699123456")?.e164).toBe("+237699123456");
  });

  it("flags Cameroon vs international numbers", () => {
    expect(parsePhone("677123456")?.isCameroon).toBe(true);
    const fr = parsePhone("+33 6 12 34 56 78");
    expect(fr?.isCameroon).toBe(false);
    expect(fr?.country).toBe("FR");
    expect(parsePhone("+33 6 12 34 56 78", false)).toBeNull();
  });

  it("rejects invalid numbers", () => {
    expect(parsePhone("12")).toBeNull();
    expect(parsePhone("")).toBeNull();
    expect(isValidCameroonMobile("+447700900123")).toBe(false);
    expect(isValidCameroonMobile("677123456")).toBe(true);
  });

  it("masks numbers for display", () => {
    expect(maskPhoneForDisplay("+237677123456")).toBe("+237 *** 456");
  });
});
