import { describe, it, expect } from "vitest";
import { catalogScoringService } from "@/services/shopee/catalog-scoring.service";

describe("CatalogScoringService (Provider-Neutral)", () => {
  it("computes comprehensive score with all signals present", () => {
    const res = catalogScoringService.evaluate({
      commissionRate: 0.15,
      soldCount: 3500,
      historicalClicks: 120,
      historicalOrders: 9, // ~7.5% CVR
      capturedAt: new Date(),
    });

    expect(res.score).toBeGreaterThanOrEqual(60);
    expect(res.components.commission).toBeGreaterThan(20);
    expect(res.components.popularity).toBeGreaterThan(20);
    expect(res.components.performance).toBeGreaterThan(10);
    expect(res.components.freshness).toBe(15);
    expect(res.missingSignals.length).toBe(0);
    expect(res.explanation).toContain("Catalog Score");
  });

  it("applies logarithmic normalization to sold count so massive numbers don't break the scale", () => {
    const res10k = catalogScoringService.evaluate({
      soldCount: 10000,
    });
    const res100k = catalogScoringService.evaluate({
      soldCount: 100000,
    });

    // 10,000 sold should achieve near max points (35)
    expect(res10k.components.popularity).toBe(35);
    // 100,000 sold is clamped to max points (35) and doesn't overshoot
    expect(res100k.components.popularity).toBe(35);
  });

  it("handles null and zero values gracefully without throwing", () => {
    const res = catalogScoringService.evaluate({
      commissionRate: null,
      soldCount: null,
      historicalClicks: null,
      historicalOrders: null,
      capturedAt: null,
    });

    expect(res.score).toBe(0);
    expect(res.missingSignals).toContain("commissionRate");
    expect(res.missingSignals).toContain("soldCount");
    expect(res.missingSignals).toContain("historicalAffiliatePerformance");
    expect(res.missingSignals).toContain("freshness");
  });

  it("correctly parses string percentage for commission rate (e.g. '18%')", () => {
    const res = catalogScoringService.evaluate({
      commissionRate: "18%",
    });

    expect(res.components.commission).toBe(26);
    expect(res.signalsUsed.commissionRate).toBe("18.0%");
  });
});
