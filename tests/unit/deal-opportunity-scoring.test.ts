import { describe, it, expect } from "vitest";
import { dealOpportunityScoringService } from "@/services/shopee/deal-opportunity-scoring.service";
import { finalPriceCalculator } from "@/services/shopee/final-price-calculator";

describe("DealOpportunityScoringService", () => {
  it("scores high for an active high-discount voucher on impulse-buy product", () => {
    const calculation = finalPriceCalculator.calculate({
      observedPrice: 120000,
      voucherDiscountType: "PERCENT",
      voucherDiscountPercent: 40,
    });

    const res = dealOpportunityScoringService.evaluate({
      calculation,
      freeShipping: true,
      flashSale: true,
      commissionRate: 0.12,
    });

    expect(res.score).toBeGreaterThanOrEqual(75);
    expect(res.components.effectiveDiscount).toBe(30); // 40% discount -> max 30 pts
    expect(res.components.priceAttractiveness).toBeGreaterThanOrEqual(16); // ~72k final price -> high attractiveness
    expect(res.components.urgency).toBeGreaterThanOrEqual(10);
    expect(res.components.extraPerks).toBe(15);
  });

  it("returns 0 score for INVALID or EXPIRED calculation", () => {
    const calculation = finalPriceCalculator.calculate({
      observedPrice: 0,
    });

    const res = dealOpportunityScoringService.evaluate({
      calculation,
    });

    expect(res.score).toBe(0);
    expect(res.explanation).toContain("Deal is INVALID");
  });

  it("evaluates UPCOMING voucher with anticipation urgency", () => {
    const validFrom = new Date(Date.now() + 30 * 60 * 1000); // 30m in future
    const calculation = finalPriceCalculator.calculate({
      observedPrice: 150000,
      voucherDiscountType: "PERCENT",
      voucherDiscountPercent: 25,
      voucherValidFrom: validFrom,
    });

    const res = dealOpportunityScoringService.evaluate({
      calculation,
    });

    expect(res.score).toBeGreaterThan(30);
    expect(res.signalsUsed.isUpcoming).toBe(true);
  });
});
