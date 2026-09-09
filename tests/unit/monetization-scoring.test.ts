import { describe, it, expect } from "vitest";
import { monetizationScoringService } from "@/services/monetization-scoring.service";

describe("Monetization Scoring Engine", () => {
  it("handles empty or null metrics safely without NaN or division by zero", () => {
    const result = monetizationScoringService.evaluateScore({
      views: null,
      likes: null,
      replies: null,
      reposts: null,
      quotes: null,
      shares: null,
    });

    expect(result.score).toBe(0);
    expect(result.isEligible).toBe(false);
    expect(result.components.reach).toBe(0);
    expect(result.components.engagement).toBe(0);
    expect(result.components.conversation).toBe(0);
    expect(result.components.amplification).toBe(0);
    expect(result.components.velocity).toBe(0);
    expect(result.explanation).toContain("Score: 0 (v1)");
    expect(result.explanation).toContain("=> WATCHING");
  });

  it("calculates balanced engagement score for active post", () => {
    const result = monetizationScoringService.evaluateScore({
      views: 1500,
      likes: 65,
      replies: 18,
      reposts: 4,
      quotes: 2,
      shares: null,
    });

    expect(result.components.reach).toBeGreaterThan(20);
    expect(result.components.engagement).toBeGreaterThan(10);
    expect(result.components.conversation).toBeGreaterThan(15);
    expect(result.components.amplification).toBeGreaterThanOrEqual(10);
    expect(result.score).toBeGreaterThanOrEqual(50);
    expect(result.isEligible).toBe(true);
    expect(result.explanation).toContain("ELIGIBLE");
  });

  it("incorporates velocity calculation when previous snapshot is available", () => {
    const oneHourAgo = new Date(Date.now() - 3600 * 1000);
    const result = monetizationScoringService.evaluateScore({
      views: 500,
      likes: 20,
      replies: 5,
      reposts: 1,
      quotes: 0,
      shares: null,
      previousSnapshots: [
        {
          views: 100, // +400 views in 1 hour
          likes: 5,
          replies: 1,
          collectedAt: oneHourAgo,
        },
      ],
    });

    expect(result.components.velocity).toBe(10); // viewsPerHour >= 50
  });

  it("respects custom threshold in scoring config", () => {
    const postMetrics = {
      views: 50,
      likes: 1,
      replies: 0,
      reposts: 0,
      quotes: 0,
      shares: null,
    };

    // Standard threshold 50 -> not eligible (score around 23)
    const standard = monetizationScoringService.evaluateScore(postMetrics, { threshold: 50 });
    expect(standard.isEligible).toBe(false);

    // Lower threshold 20 -> eligible
    const relaxed = monetizationScoringService.evaluateScore(postMetrics, { threshold: 20 });
    expect(relaxed.isEligible).toBe(true);
    expect(relaxed.explanation).toContain("Threshold: 20 => ELIGIBLE");
  });
});
