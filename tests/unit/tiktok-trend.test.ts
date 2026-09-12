import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  TiktokTrendService,
  ViralContentCandidate,
} from "@/services/trends/tiktok-trend.service";

describe("TiktokTrendService", () => {
  let service: TiktokTrendService;

  beforeEach(() => {
    service = new TiktokTrendService();
    vi.restoreAllMocks();
  });

  describe("Caption Rewriting for Threads Hooks", () => {
    it("strips spam hashtags and mentions from raw TikTok captions", () => {
      const raw = "Kem dưỡng ẩm Torriden đỉnh nóc kịch trần #fyp #xuhuong #trending #viral @torriden_vn";
      const rewritten = service.rewriteCaptionForThreads(raw);

      expect(rewritten).not.toContain("#fyp");
      expect(rewritten).not.toContain("#xuhuong");
      expect(rewritten).not.toContain("@torriden_vn");
      expect(rewritten).toContain("Kem dưỡng ẩm Torriden đỉnh nóc kịch trần");
      expect(rewritten).toContain("👇");
    });

    it("applies conversational bait templates that encourage comments", () => {
      const raw = "Mẹo làm sạch nồi chiên không dầu trong 5 phút";
      const rewritten = service.rewriteCaptionForThreads(raw);

      expect(rewritten).toMatch(/review|feedback|lời khuyên|rần rần|cuốn/i);
      expect(rewritten).toContain("Mẹo làm sạch nồi chiên không dầu trong 5 phút");
    });

    it("handles empty or whitespace captions gracefully", () => {
      const rewritten = service.rewriteCaptionForThreads("   ");
      expect(rewritten).toContain("Lướt thấy clip này cuốn quá mọi người ơi");
    });

    it("strictly bounds caption length to under 500 characters for Threads API limits", () => {
      const veryLong = "A".repeat(600);
      const rewritten = service.rewriteCaptionForThreads(veryLong);
      expect(rewritten.length).toBeLessThanOrEqual(500);
    });
  });

  describe("Fetching & Normalizing Trending Videos", () => {
    const mockFeedResponse = {
      code: 0,
      msg: "success",
      data: [
        {
          video_id: "7100000001",
          title: "Clip triệu view cực cuốn #xh #trending",
          play: "https://v16.tiktokcdn.com/clean-video-1.mp4",
          wmplay: "https://v16.tiktokcdn.com/watermarked-1.mp4",
          cover: "https://p16.tiktokcdn.com/cover-1.jpg",
          play_count: 250000,
          digg_count: 15000,
          share_count: 1200,
          comment_count: 450,
          duration: 35,
          create_time: 1725900000,
          author: {
            id: "user_1",
            unique_id: "beauty_review_vn",
            nickname: "Beauty Reviewer",
            avatar: "https://p16.tiktokcdn.com/avatar-1.jpg",
          },
        },
        {
          video_id: "7100000002",
          title: "Clip ít view không đạt chuẩn lọc",
          play: "/video/clean-2.mp4",
          cover: "/cover/cover-2.jpg",
          play_count: 5000, // < 50000
          digg_count: 120, // < 2000
          share_count: 5,
          comment_count: 2,
          duration: 15,
          create_time: 1725900100,
          author: {
            unique_id: "newbie_user",
            nickname: "Newbie",
          },
        },
        {
          video_id: "7100000003",
          title: "Clip view vừa nhưng tim khủng (đạt chuẩn tim)",
          play: "https://v16.tiktokcdn.com/clean-video-3.mp4",
          cover: "https://p16.tiktokcdn.com/cover-3.jpg",
          play_count: 35000, // < 50000
          digg_count: 4500, // >= 2000 -> PASS
          share_count: 300,
          comment_count: 80,
          duration: 20,
          create_time: 1725900200,
          author: {
            unique_id: "viral_hacks",
            nickname: "Viral Life Hacks",
          },
        },
      ],
    };

    it("fetches trending feed, filters by engagement, and extracts clean no-watermark videoUrl", async () => {
      vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => mockFeedResponse,
      } as any);

      const candidates = await service.fetchTrendingVideos({
        region: "VN",
        count: 10,
        minViews: 50000,
        minLikes: 2000,
      });

      // Video 1 (250k views) and Video 3 (4.5k likes) should pass. Video 2 should be filtered out.
      expect(candidates).toHaveLength(2);

      const first = candidates[0];
      expect(first.id).toBe("7100000001");
      expect(first.videoUrl).toBe("https://v16.tiktokcdn.com/clean-video-1.mp4");
      expect(first.videoUrl).not.toContain("watermarked");
      expect(first.coverUrl).toBe("https://p16.tiktokcdn.com/cover-1.jpg");
      expect(first.stats.views).toBe(250000);
      expect(first.stats.likes).toBe(15000);
      expect(first.author.uniqueId).toBe("beauty_review_vn");
      expect(first.suggestedThreadsCaption).not.toContain("#xh");
    });

    it("prepends https://www.tikwm.com for relative play/cover paths", async () => {
      const relativeFixture = {
        code: 0,
        msg: "success",
        data: [
          {
            video_id: "7200000001",
            title: "Relative URL clip",
            play: "/video/path/clean.mp4",
            cover: "/cover/path/cover.jpg",
            play_count: 100000,
            digg_count: 5000,
          },
        ],
      };

      vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => relativeFixture,
      } as any);

      const candidates = await service.fetchTrendingVideos({ region: "VN" });
      expect(candidates).toHaveLength(1);
      expect(candidates[0].videoUrl).toBe("https://www.tikwm.com/video/path/clean.mp4");
      expect(candidates[0].coverUrl).toBe("https://www.tikwm.com/cover/path/cover.jpg");
    });

    it("falls back gracefully when API returns non-200 or network failure", async () => {
      vi.spyOn(global, "fetch").mockRejectedValueOnce(new Error("Network timeout"));
      const candidates = await service.fetchTrendingVideos();
      expect(candidates).toEqual([]);
    });
  });

  describe("Keyword Search for Viral Videos", () => {
    it("searches videos with query parameters and handles data.videos response structure", async () => {
      const mockSearchResponse = {
        code: 0,
        msg: "success",
        data: {
          videos: [
            {
              video_id: "7300000001",
              title: "Review serum Torriden sau 14 ngày dùng",
              play: "https://v16.tiktokcdn.com/torriden-review.mp4",
              cover: "https://p16.tiktokcdn.com/torriden-cover.jpg",
              play_count: 85000,
              digg_count: 6200,
              share_count: 890,
              comment_count: 150,
              duration: 45,
              author: {
                unique_id: "skincare_daily",
                nickname: "Skincare Daily",
              },
            },
          ],
        },
      };

      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => mockSearchResponse,
      } as any);

      const candidates = await service.searchViralVideos({
        query: "torriden review",
        region: "VN",
        count: 10,
      });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(candidates).toHaveLength(1);
      expect(candidates[0].id).toBe("7300000001");
      expect(candidates[0].title).toBe("Review serum Torriden sau 14 ngày dùng");
      expect(candidates[0].stats.views).toBe(85000);
      expect(candidates[0].stats.likes).toBe(6200);
    });

    it("falls back to returning top candidates if strict threshold yields 0 results for narrow keywords", () => {
      const narrowResults = [
        {
          video_id: "7400000001",
          title: "Món đồ siêu độc lạ nhưng ít người biết",
          play: "https://v16.tiktokcdn.com/video-narrow.mp4",
          cover: "https://p16.tiktokcdn.com/cover-narrow.jpg",
          play_count: 12000, // below 50000
          digg_count: 800,   // below 2000
        },
      ];

      const processed = service.processRawVideos(narrowResults, {
        region: "VN",
        minViews: 50000,
        minLikes: 2000,
      });

      // Fallback preserves candidate instead of returning empty array
      expect(processed).toHaveLength(1);
      expect(processed[0].id).toBe("7400000001");
    });
  });

  describe("Strict Language & Regional Content Filtering (filterCandidatesByLanguageAndRegion)", () => {
    const createCandidate = (id: string, title: string, authorUniqueId = "user", authorNickname = "User"): ViralContentCandidate => ({
      id,
      title,
      videoUrl: `https://tikwm.com/video/${id}.mp4`,
      coverUrl: `https://tikwm.com/cover/${id}.jpg`,
      stats: { views: 100000, likes: 5000, comments: 200, shares: 100 },
      author: { uniqueId: authorUniqueId, nickname: authorNickname },
      duration: 30,
      region: "VN",
      createdAt: Date.now(),
      engagementScore: 5000,
      suggestedThreadsCaption: title,
    });

    it("filters out videos containing Burmese / Myanmar characters (unicode range \\u1000-\\u109F, \\uAA60-\\uAA7F)", () => {
      const candidates = [
        createCandidate("vn_1", "Top 5 kem dưỡng ẩm bình dân đỉnh nhất"),
        createCandidate("burmese_1", "မင်္ဂလာပါရှင် အသားအရေထိန်းသိမ်းမှု"),
        createCandidate("burmese_2", "Skincare review မင်္ဂလာ"),
      ];

      const filtered = service.filterCandidatesByLanguageAndRegion(candidates, "VN");
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe("vn_1");
    });

    it("filters out videos containing Thai characters (unicode range \\u0E00-\\u0E7F)", () => {
      const candidates = [
        createCandidate("vn_2", "Review nồi chiên không dầu dùng cực thích"),
        createCandidate("thai_1", "รีวิวสกินแคร์ เกาหลีถูกและดี"),
        createCandidate("thai_2", "เครื่องสำอางค์ยอดนิยม"),
      ];

      const filtered = service.filterCandidatesByLanguageAndRegion(candidates, "VN");
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe("vn_2");
    });

    it("filters out videos containing Khmer, Arabic, Cyrillic, or Chinese scripts", () => {
      const candidates = [
        createCandidate("vn_3", "Serum phục hồi da mờ thâm nám xịn sò"),
        createCandidate("khmer_1", "ការថែរក្សាស្បែកល្អ"),
        createCandidate("arabic_1", "عناية بالبشرة روتين يومي"),
        createCandidate("cyrillic_1", "Обзор лучшей косметики"),
        createCandidate("chinese_1", "超好用的护肤品推荐"),
      ];

      const filtered = service.filterCandidatesByLanguageAndRegion(candidates, "VN");
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe("vn_3");
    });

    it("discards purely foreign Latin languages (Indonesian stopwords) without Vietnamese markers during search", () => {
      const candidates = [
        createCandidate("vn_4", "Review serum trắng da cho học sinh sinh viên"),
        createCandidate("indo_1", "Rekomendasi serum pencerah wajah terbaik untuk remaja"),
        createCandidate("indo_2", "Skincare routine pagi malam yang ampuh banget buat kalian"),
      ];

      const filtered = service.filterCandidatesByLanguageAndRegion(candidates, "VN", "skincare review");
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe("vn_4");
    });

    it("retains authentic Vietnamese videos matching query tokens and tone diacritics", () => {
      const candidates = [
        createCandidate("vn_5", "Top 3 kem chống nắng kiềm dầu nâng tone cực đỉnh"),
        createCandidate("foreign_no_vn", "Best summer sunscreens for glowing skin this year"),
      ];

      const filtered = service.filterCandidatesByLanguageAndRegion(candidates, "VN", "kem chống nắng");
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe("vn_5");
    });

    it("does not filter non-target scripts when querying other regions like Thailand (TH)", () => {
      const candidates = [
        createCandidate("thai_3", "รีวิวสกินแคร์ เกาหลีถูกและดี"),
      ];

      const filtered = service.filterCandidatesByLanguageAndRegion(candidates, "TH");
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe("thai_3");
    });
  });
});
