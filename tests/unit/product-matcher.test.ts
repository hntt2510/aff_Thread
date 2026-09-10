import { describe, it, expect } from "vitest";
import { productMatcherService, MatcherCandidateItem } from "@/services/shopee/product-matcher.service";

describe("ProductMatcherService", () => {
  const candidates: MatcherCandidateItem[] = [
    {
      id: "prod-1",
      title: "Tai nghe bluetooth không dây chống ồn pin trâu",
      category: "Công nghệ",
      productUrl: "https://shopee.vn/product/1",
      affiliateUrl: "https://s.shopee.vn/aff1",
      catalogScore: 85,
      dealOpportunityScore: 90,
      performanceScore: 70,
    },
    {
      id: "prod-2",
      title: "Váy hoa nhí vintage mùa hè",
      category: "Thời trang",
      productUrl: "https://shopee.vn/product/2",
      affiliateUrl: "https://s.shopee.vn/aff2",
      catalogScore: 80,
      dealOpportunityScore: 75,
      performanceScore: 60,
    },
    {
      id: "prod-3",
      title: "Bàn phím cơ không dây bluetooth RGB",
      category: "Công nghệ",
      productUrl: "https://shopee.vn/product/3",
      affiliateUrl: "https://s.shopee.vn/aff3",
      catalogScore: 70,
      dealOpportunityScore: 65,
      performanceScore: 50,
    },
  ];

  it("ranks the most relevant product #1 for technology post", () => {
    const postText = "Ai đang tìm tai nghe bluetooth không dây chống ồn ngon bổ rẻ thì vào đây xem nhé!";
    const ranked = productMatcherService.rankCandidates(postText, candidates, { topN: 3 });

    expect(ranked.length).toBe(3);
    expect(ranked[0].product.id).toBe("prod-1");
    expect(ranked[0].rank).toBe(1);
    expect(ranked[0].totalMatchScore).toBeGreaterThan(ranked[1].totalMatchScore);
    expect(ranked[0].matchedKeywords).toContain("tai");
    expect(ranked[0].matchedKeywords).toContain("nghe");
    expect(ranked[0].matchedKeywords).toContain("bluetooth");
  });

  it("respects topN option and minMatchScore", () => {
    const postText = "Review bàn phím cơ";
    const top1 = productMatcherService.rankCandidates(postText, candidates, { topN: 1 });
    expect(top1.length).toBe(1);

    const highFilter = productMatcherService.rankCandidates(postText, candidates, { minMatchScore: 95 });
    expect(highFilter.length).toBe(0);
  });

  it("falls back to Top 1 highest-scoring pool deal when no direct keyword or category match is found", () => {
    const irrelevantPost = "Hôm nay thời tiết đẹp đi dạo ngắm hoàng hôn ven hồ Tây";
    const fallbackResults = productMatcherService.rankCandidates(irrelevantPost, candidates, { topN: 3 });

    expect(fallbackResults.length).toBe(1);
    expect(fallbackResults[0].isFallback).toBe(true);
    expect(fallbackResults[0].rank).toBe(1);
    // prod-1: deal 90 * 0.6 + catalog 85 * 0.4 = 88 (highest in candidates)
    expect(fallbackResults[0].product.id).toBe("prod-1");
    expect(fallbackResults[0].matchedKeywords).toEqual([]);
    expect(fallbackResults[0].explanation).toContain("Fallback to Top 1 highest-scoring deal");
  });
});
