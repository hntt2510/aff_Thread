import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { POST as fetchTrendsHandler } from "@/app/api/trends/fetch/route";
import { POST as generateDraftHandler } from "@/app/api/trends/generate-draft/route";
import { tiktokTrendService, generateBaitCaption } from "@/services/trends/tiktok-trend.service";
import { weeklyPoolService } from "@/services/shopee/weekly-pool.service";
import { productMatcherService } from "@/services/shopee/product-matcher.service";
import { NextRequest } from "next/server";

function createMockRequest(body: any): NextRequest {
  return new NextRequest("http://localhost:3000/api/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Trend Discovery & Bait-Post Draft Seeding", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("API Route: POST /api/trends/fetch", () => {
    it("fetches trending videos and returns data array with count", async () => {
      const mockVideos = [
        {
          id: "vid_101",
          title: "Top 3 kem dưỡng ẩm mùa hanh khô",
          videoUrl: "https://api.tikwmapi.com/clean-101.mp4",
          coverUrl: "https://api.tikwmapi.com/cover-101.jpg",
          stats: { views: 120000, likes: 8500, comments: 230, shares: 410 },
          author: { uniqueId: "skincare_vn", nickname: "Skincare VN" },
          duration: 35,
          region: "VN",
          createdAt: Date.now(),
          engagementScore: 10000,
          suggestedThreadsCaption: "Gợi ý kem dưỡng ẩm mùa này...",
        },
      ];

      vi.spyOn(tiktokTrendService, "fetchTrending").mockResolvedValueOnce(mockVideos as any);

      const req = createMockRequest({ region: "VN", count: 10 });
      const res = await fetchTrendsHandler(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.count).toBe(1);
      expect(Array.isArray(json.data)).toBe(true);
      expect(json.data[0].id).toBe("vid_101");
      expect(json.data[0].videoUrl).toBe("https://api.tikwmapi.com/clean-101.mp4");
      // Backwards compatibility check
      expect(json.candidates).toEqual(json.data);
    });

    it("searches viral videos by keyword when query parameter is provided", async () => {
      const mockSearchResults = [
        {
          id: "vid_202",
          title: "Review nồi chiên không dầu Lock&Lock sau 1 năm",
          videoUrl: "https://api.tikwmapi.com/clean-202.mp4",
          coverUrl: "https://api.tikwmapi.com/cover-202.jpg",
          stats: { views: 80000, likes: 4200, comments: 110, shares: 95 },
          author: { uniqueId: "kitchen_hacks", nickname: "Bếp Nhà Decor" },
          duration: 45,
          region: "VN",
          createdAt: Date.now(),
          engagementScore: 5000,
          suggestedThreadsCaption: "Có nên mua nồi chiên Lock&Lock không...",
        },
      ];

      const searchSpy = vi
        .spyOn(tiktokTrendService, "search")
        .mockResolvedValueOnce(mockSearchResults as any);

      const req = createMockRequest({ query: "nồi chiên không dầu", region: "VN", count: 15 });
      const res = await fetchTrendsHandler(req);
      const json = await res.json();

      expect(searchSpy).toHaveBeenCalledWith("nồi chiên không dầu", 15, "VN");
      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.count).toBe(1);
      expect(json.data[0].id).toBe("vid_202");
    });

    it("returns HTTP 500 with sanitized error message if service fails", async () => {
      vi.spyOn(tiktokTrendService, "fetchTrending").mockRejectedValueOnce(
        new Error("Connection reset by peer")
      );

      const req = createMockRequest({});
      const res = await fetchTrendsHandler(req);
      const json = await res.json();

      expect(res.status).toBe(500);
      expect(json.success).toBe(false);
      expect(json.error).toBeTruthy();
    });
  });

  describe("API Route: POST /api/trends/generate-draft", () => {
    it("returns HTTP 400 when videoTitle or videoUrl is missing", async () => {
      const req = createMockRequest({ videoTitle: "" });
      const res = await generateDraftHandler(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain("Missing required fields");
    });

    it("generates bait caption and matches Top 1 deal with dual-persona replies", async () => {
      const mockPoolItem = {
        poolItem: {
          id: "pool_1",
          weekStart: "2026-W37",
          rank: 1,
          catalogScore: 88,
          reasonJson: null,
          selectedAt: new Date().toISOString(),
        },
        product: {
          id: "prod_shopee_1",
          title: "Serum Cấp Nước Phục Hồi Da Torriden Dive-In Low Molecule 50ml",
          category: "Skincare",
          productUrl: "https://shopee.vn/product/123/456",
          imageUrl: "https://cf.shopee.vn/file/torriden.jpg",
        },
        offer: {
          id: "offer_1",
          affiliateUrl: "https://s.shopee.vn/TORRIDEN_AFF",
          commissionRate: "15%",
          commissionAmount: 45000,
          soldCount: 5000,
        },
      };

      vi.spyOn(weeklyPoolService, "getPoolForWeek").mockResolvedValueOnce([mockPoolItem as any]);

      const req = createMockRequest({
        videoTitle: "Serum Torriden dưỡng ẩm siêu đỉnh nóc kịch trần #xh #fyp @torriden",
        videoUrl: "https://api.tikwmapi.com/torriden-clean.mp4",
        coverUrl: "https://api.tikwmapi.com/torriden-cover.jpg",
        videoId: "750000001",
      });

      const res = await generateDraftHandler(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.draft).toBeDefined();

      const draft = json.draft;
      expect(draft.mediaUrl).toBe("https://api.tikwmapi.com/torriden-clean.mp4");
      expect(draft.coverUrl).toBe("https://api.tikwmapi.com/torriden-cover.jpg");
      expect(draft.videoId).toBe("750000001");

      // Bait Caption should be formatted without hashtags
      expect(draft.baitCaption).not.toContain("#xh");
      expect(draft.baitCaption).not.toContain("#fyp");
      expect(draft.baitCaption).toContain("Torriden");

      // Matched Product
      expect(draft.matchedProduct).toBeDefined();
      expect(draft.matchedProduct.id).toBe("prod_shopee_1");
      expect(draft.matchedProduct.name).toContain("Torriden");
      expect(draft.matchedProduct.price).toBeGreaterThan(0);
      expect(draft.matchedProduct.affiliateUrl).toBe("https://s.shopee.vn/TORRIDEN_AFF");

      // Dual persona replies
      expect(draft.matchedProduct.replyReviewer).toContain("https://s.shopee.vn/TORRIDEN_AFF");
      expect(draft.matchedProduct.replyCombo).toContain("https://s.shopee.vn/TORRIDEN_AFF");
      expect(["HELPFUL_REVIEWER", "COMBO_VALUE_HACKER"]).toContain(
        draft.matchedProduct.recommendedPersona
      );
    });

    it("handles fallback gracefully when no products match or pool is empty", async () => {
      vi.spyOn(weeklyPoolService, "getPoolForWeek").mockResolvedValueOnce([]);
      vi.spyOn(productMatcherService, "rankCandidates").mockReturnValueOnce([]);

      const req = createMockRequest({
        videoTitle: "Clip ngẫu nhiên không có sản phẩm thương mại",
        videoUrl: "https://api.tikwmapi.com/random.mp4",
        coverUrl: "https://api.tikwmapi.com/random.jpg",
        videoId: "750000002",
      });

      const res = await generateDraftHandler(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.draft.baitCaption).toBeTruthy();
      expect(json.draft.matchedProduct).toBeNull();
    });
  });

  describe("Bait Caption Generation with LLM & Fallback", () => {
    it("falls back to conversational hook rewriter when no LLM API key is present", async () => {
      delete process.env.GEMINI_API_KEY;
      delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      const title = "Mẹo làm sạch thảm sofa cực nhanh #tips #cleaning @home";
      const caption = await generateBaitCaption(title);

      expect(caption).not.toContain("#tips");
      expect(caption).not.toContain("@home");
      expect(caption).toContain("Mẹo làm sạch thảm sofa cực nhanh");
      expect(caption.length).toBeLessThanOrEqual(500);
    });

    it("uses Gemini API when GEMINI_API_KEY is configured", async () => {
      process.env.GEMINI_API_KEY = "mock_gemini_key";

      const mockGeminiResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: "Dạo này lướt thấy clip vệ sinh thảm sofa này viral quá. Có ai thử chưa cho mình xin review với 👇",
                },
              ],
            },
          },
        ],
      };

      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => mockGeminiResponse,
      } as any);

      const caption = await generateBaitCaption("Mẹo làm sạch thảm sofa");

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining("generativelanguage.googleapis.com"),
        expect.objectContaining({ method: "POST" })
      );
      expect(caption).toContain("Dạo này lướt thấy clip vệ sinh thảm sofa");

      delete process.env.GEMINI_API_KEY;
    });

    it("falls back to rule-based rewriter if Gemini API fails or times out", async () => {
      process.env.GEMINI_API_KEY = "bad_gemini_key";

      vi.spyOn(global, "fetch").mockRejectedValueOnce(new Error("API quota exceeded"));

      const caption = await generateBaitCaption("Cách nấu lẩu thái chua cay đậm đà");

      expect(caption).toBeTruthy();
      expect(caption).toContain("Cách nấu lẩu thái chua cay đậm đà");

      delete process.env.GEMINI_API_KEY;
    });
  });
});
