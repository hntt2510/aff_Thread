import { describe, it, expect } from "vitest";
import { finalPriceCalculator, PriceCalculationInput } from "@/services/shopee/final-price-calculator";

describe("FinalPriceCalculator (Pure Deterministic Math)", () => {
  it("calculates 100,000đ with 30% uncapped voucher to 70,000đ", () => {
    const res = finalPriceCalculator.calculate({
      observedPrice: 100000,
      voucherDiscountType: "PERCENT",
      voucherDiscountPercent: 30,
    });

    expect(res.dealState).toBe("ACTIVE");
    expect(res.applicable).toBe("YES");
    expect(res.basePrice).toBe(100000);
    expect(res.discountAmount).toBe(30000);
    expect(res.estimatedFinalPrice).toBe(70000);
  });

  it("calculates 100,000đ with 30% voucher capped at 20,000đ to 80,000đ", () => {
    const res = finalPriceCalculator.calculate({
      observedPrice: 100000,
      voucherDiscountType: "PERCENT",
      voucherDiscountPercent: 30,
      voucherMaxDiscount: 20000,
    });

    expect(res.dealState).toBe("ACTIVE");
    expect(res.applicable).toBe("YES");
    expect(res.discountAmount).toBe(20000);
    expect(res.estimatedFinalPrice).toBe(80000);
  });

  it("returns NOT APPLICABLE when minimum spend 150,000đ is not met for 100,000đ item", () => {
    const res = finalPriceCalculator.calculate({
      observedPrice: 100000,
      quantity: 1,
      voucherDiscountType: "PERCENT",
      voucherDiscountPercent: 30,
      voucherMinSpend: 150000,
    });

    expect(res.applicable).toBe("NO");
    expect(res.discountAmount).toBe(0);
    expect(res.estimatedFinalPrice).toBe(100000);
    expect(res.reason).toContain("Minimum spend");
  });

  it("identifies UPCOMING voucher when evaluated before valid_from with clear warning", () => {
    const validFrom = new Date("2026-09-09T12:00:00.000Z");
    const evalTime = new Date("2026-09-09T11:40:00.000Z"); // 20 minutes before

    const res = finalPriceCalculator.calculate({
      observedPrice: 100000,
      voucherDiscountType: "PERCENT",
      voucherDiscountPercent: 30,
      voucherValidFrom: validFrom,
      evaluationTime: evalTime,
    });

    expect(res.dealState).toBe("UPCOMING");
    expect(res.applicable).toBe("YES");
    expect(res.basePrice).toBe(100000);
    expect(res.estimatedFinalPrice).toBe(70000);
    expect(res.warning).toContain("Voucher not active yet");
    expect(res.warning).toContain("Do not claim 70,000đ as current price");
  });

  it("identifies EXPIRED voucher when evaluated after valid_until", () => {
    const validUntil = new Date("2026-09-09T10:00:00.000Z");
    const evalTime = new Date("2026-09-09T10:01:00.000Z");

    const res = finalPriceCalculator.calculate({
      observedPrice: 100000,
      voucherDiscountType: "PERCENT",
      voucherDiscountPercent: 30,
      voucherValidUntil: validUntil,
      evaluationTime: evalTime,
    });

    expect(res.dealState).toBe("EXPIRED");
    expect(res.applicable).toBe("NO");
    expect(res.discountAmount).toBe(0);
    expect(res.estimatedFinalPrice).toBe(100000);
    expect(res.reason).toContain("expired");
  });

  it("calculates fixed amount voucher subtraction accurately", () => {
    const res = finalPriceCalculator.calculate({
      observedPrice: 100000,
      voucherDiscountType: "FIXED",
      voucherDiscountAmount: 25000,
    });

    expect(res.dealState).toBe("ACTIVE");
    expect(res.applicable).toBe("YES");
    expect(res.discountAmount).toBe(25000);
    expect(res.estimatedFinalPrice).toBe(75000);
  });

  it("returns applicable UNKNOWN with caveat when user eligibility is UNKNOWN", () => {
    const res = finalPriceCalculator.calculate({
      observedPrice: 100000,
      voucherDiscountType: "PERCENT",
      voucherDiscountPercent: 30,
      userEligibility: "UNKNOWN",
    });

    expect(res.dealState).toBe("ACTIVE");
    expect(res.applicable).toBe("UNKNOWN");
    expect(res.estimatedFinalPrice).toBe(70000);
    expect(res.warning).toContain("may depend on user account");
  });

  it("returns INVALID state for zero or negative observed price", () => {
    const resZero = finalPriceCalculator.calculate({
      observedPrice: 0,
      voucherDiscountPercent: 20,
    });
    expect(resZero.dealState).toBe("INVALID");
    expect(resZero.applicable).toBe("NO");

    const resNeg = finalPriceCalculator.calculate({
      observedPrice: -5000,
      voucherDiscountPercent: 20,
    });
    expect(resNeg.dealState).toBe("INVALID");
  });

  it("handles exact timestamp boundary at valid_from as ACTIVE", () => {
    const exactTime = new Date("2026-09-09T12:00:00.000Z");

    const res = finalPriceCalculator.calculate({
      observedPrice: 100000,
      voucherDiscountType: "PERCENT",
      voucherDiscountPercent: 30,
      voucherValidFrom: exactTime,
      evaluationTime: exactTime,
    });

    expect(res.dealState).toBe("ACTIVE");
    expect(res.applicable).toBe("YES");
    expect(res.estimatedFinalPrice).toBe(70000);
  });

  it("handles exact timestamp boundary at valid_until as ACTIVE", () => {
    const exactTime = new Date("2026-09-09T12:00:00.000Z");

    const res = finalPriceCalculator.calculate({
      observedPrice: 100000,
      voucherDiscountType: "PERCENT",
      voucherDiscountPercent: 30,
      voucherValidUntil: exactTime,
      evaluationTime: exactTime,
    });

    expect(res.dealState).toBe("ACTIVE");
    expect(res.applicable).toBe("YES");
    expect(res.estimatedFinalPrice).toBe(70000);
  });

  it("enforces integer VND precision without floating-point decimals", () => {
    // 33,333đ with 17% discount
    const res = finalPriceCalculator.calculate({
      observedPrice: 33333,
      voucherDiscountType: "PERCENT",
      voucherDiscountPercent: 17,
    });

    expect(Number.isInteger(res.discountAmount)).toBe(true);
    expect(Number.isInteger(res.estimatedFinalPrice)).toBe(true);
    expect(res.discountAmount).toBe(Math.round(33333 * 0.17)); // 5667
    expect(res.estimatedFinalPrice).toBe(33333 - 5667); // 27666
  });
});
