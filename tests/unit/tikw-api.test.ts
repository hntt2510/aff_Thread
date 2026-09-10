import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  TikWApiService,
  TikWApiError,
  ViralVideoItem,
} from "@/services/trends/tikw-api.service";
import { TiktokTrendService } from "@/services/trends/tiktok-trend.service";

describe("TikWApiService", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Initialization & Authentication Headers", () => {
    it("includes x-api-key and Authorization headers when apiKey is provided", async () => {
      const service = new TikWApiService({
        apiKey: "test-secret-key-123",
        baseUrl: "https://api.tikwmapi.com",
      });

      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 0,
          msg: "success",
          data: [],
        }),
      } as any);

      await service.fetchTrendingVideos("VN", 10);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [, init] = fetchSpy.mock.calls[0];
      const headers = init?.headers as Record<string, string>;

      expect(headers["x-api-key"]).toBe("test-secret-key-123");
      expect(headers["Authorization"]).toBe("Bearer test-secret-key-123");
      expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    });

    it("omits auth headers when apiKey is not configured", async () => {
      const service = new TikWApiService({
        apiKey: undefined,
        baseUrl: "https://api.tikwmapi.com",
      });

      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 0,
          msg: "success",
          data: [],
        }),
      } as any);

      await service.fetchTrendingVideos("VN", 5);

      const [, init] = fetchSpy.mock.calls[0];
      const headers = init?.headers as Record<string, string>;
      expect(headers["x-api-key"]).toBeUndefined();
      expect(headers["Authorization"]).toBeUndefined();
    });

    it("supports setting API key dynamically via setApiKey", () => {
      const service = new TikWApiService();
      expect(service.getApiKey()).toBeUndefined();

      service.setApiKey("dynamic_key_999");
      expect(service.getApiKey()).toBe("dynamic_key_999");
    });
  });

  describe("Fetching Trending Videos (/api/feed/list)", () => {
    const mockTrendingFixture = {
      code: 0,
      msg: "success",
      data: [
        {
          video_id: "7310000001",
          title: "Top 5 đồ gia dụng thông minh đáng mua 2026",
          play: "https://v16.tiktokcdn.com/clean-video.mp4",
          wmplay: "https://v16.tiktokcdn.com/watermarked-video.mp4",
          cover: "https://p16.tiktokcdn.com/cover.jpg",
          play_count: 520000,
          digg_count: 35000,
          comment_count: 890,
          share_count: 2400,
          duration: 42,
          create_time: 1725900000,
          author: {
            id: "user_decor",
            unique_id: "home_decor_expert",
            nickname: "Nghiện Nhà Decor",
            avatar: "https://p16.tiktokcdn.com/avatar.jpg",
          },
        },
      ],
    };

    it("posts to /api/feed/list with region and count params, extracting clean watermark-free video", async () => {
      const service = new TikWApiService({
        apiKey: "key_abc",
        baseUrl: "https://api.tikwmapi.com",
      });

      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => mockTrendingFixture,
      } as any);

      const items = await service.fetchTrendingVideos("VN", 20);

      expect(fetchSpy).toHaveBeenCalledWith(
        "https://api.tikwmapi.com/api/feed/list",
        expect.objectContaining({
          method: "POST",
          body: expect.any(URLSearchParams),
        })
      );

      expect(items).toHaveLength(1);
      const item = items[0];
      expect(item.id).toBe("7310000001");
      expect(item.title).toBe("Top 5 đồ gia dụng thông minh đáng mua 2026");
      expect(item.videoUrl).toBe("https://v16.tiktokcdn.com/clean-video.mp4");
      expect(item.videoUrl).not.toContain("watermarked");
      expect(item.coverUrl).toBe("https://p16.tiktokcdn.com/cover.jpg");
      expect(item.views).toBe(520000);
      expect(item.likes).toBe(35000);
      expect(item.comments).toBe(890);
      expect(item.shares).toBe(2400);
      expect(item.authorName).toBe("Nghiện Nhà Decor");
      expect(item.authorUsername).toBe("home_decor_expert");
      expect(item.duration).toBe(42);
    });

    it("resolves relative play and cover URLs with base URL", async () => {
      const relativeFixture = {
        code: 0,
        data: [
          {
            id: "7320000002",
            title: "Relative URL item",
            play: "/video/clean_relative.mp4",
            cover: "/image/cover_relative.jpg",
            play_count: 10000,
            digg_count: 500,
          },
        ],
      };

      const service = new TikWApiService({ baseUrl: "https://api.tikwmapi.com" });
      vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => relativeFixture,
      } as any);

      const items = await service.fetchTrendingVideos();
      expect(items).toHaveLength(1);
      expect(items[0].videoUrl).toBe("https://api.tikwmapi.com/video/clean_relative.mp4");
      expect(items[0].coverUrl).toBe("https://api.tikwmapi.com/image/cover_relative.jpg");
    });
  });

  describe("Search by Keyword (/api/feed/search)", () => {
    it("posts to /api/feed/search with keyword and count, handling data.videos structure", async () => {
      const searchFixture = {
        code: 0,
        msg: "success",
        data: {
          videos: [
            {
              video_id: "7330000003",
              title: "Review kem chống nắng Anessa cực chi tiết",
              play: "https://v16.tiktokcdn.com/anessa-review.mp4",
              cover: "https://p16.tiktokcdn.com/anessa.jpg",
              play_count: 180000,
              digg_count: 12000,
              comment_count: 340,
              share_count: 650,
              author: {
                unique_id: "skincare_guru",
                nickname: "Skincare Guru VN",
              },
            },
          ],
        },
      };

      const service = new TikWApiService({ apiKey: "test_key" });
      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => searchFixture,
      } as any);

      const items = await service.searchViralVideos("anessa review", 15);

      expect(fetchSpy).toHaveBeenCalledWith(
        "https://api.tikwmapi.com/api/feed/search",
        expect.objectContaining({
          method: "POST",
          body: expect.any(URLSearchParams),
        })
      );

      const bodyParam = (fetchSpy.mock.calls[0][1]?.body as URLSearchParams).toString();
      expect(bodyParam).toContain("keywords=anessa+review");
      expect(bodyParam).toContain("count=15");

      expect(items).toHaveLength(1);
      expect(items[0].id).toBe("7330000003");
      expect(items[0].title).toContain("Anessa");
      expect(items[0].authorUsername).toBe("skincare_guru");
    });
  });

  describe("Error Handling", () => {
    it("throws INVALID_API_KEY when response is HTTP 401 or 403", async () => {
      const service = new TikWApiService({ apiKey: "bad_key" });
      vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: false,
        status: 401,
      } as any);

      await expect(service.fetchTrendingVideos()).rejects.toThrow(TikWApiError);
      try {
        vi.spyOn(global, "fetch").mockResolvedValueOnce({
          ok: false,
          status: 401,
        } as any);
        await service.fetchTrendingVideos();
      } catch (err: any) {
        expect(err.code).toBe("INVALID_API_KEY");
        expect(err.message).toContain("Invalid or missing TikW-API key");
      }
    });

    it("throws RATE_LIMITED when response is HTTP 429", async () => {
      const service = new TikWApiService();
      vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: false,
        status: 429,
      } as any);

      await expect(service.fetchTrendingVideos()).rejects.toThrow(TikWApiError);
      try {
        vi.spyOn(global, "fetch").mockResolvedValueOnce({
          ok: false,
          status: 429,
        } as any);
        await service.fetchTrendingVideos();
      } catch (err: any) {
        expect(err.code).toBe("RATE_LIMITED");
        expect(err.message).toContain("rate limit exceeded");
      }
    });

    it("throws SERVER_ERROR when response is HTTP 500+", async () => {
      const service = new TikWApiService();
      vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: false,
        status: 502,
      } as any);

      try {
        await service.fetchTrendingVideos();
      } catch (err: any) {
        expect(err.code).toBe("SERVER_ERROR");
        expect(err.message).toContain("server error (HTTP 502)");
      }
    });

    it("throws TIMEOUT when fetch is aborted", async () => {
      const service = new TikWApiService({ timeoutMs: 50 });
      const abortError = new Error("The operation was aborted");
      abortError.name = "AbortError";
      vi.spyOn(global, "fetch").mockRejectedValueOnce(abortError);

      try {
        await service.fetchTrendingVideos();
      } catch (err: any) {
        expect(err.code).toBe("TIMEOUT");
        expect(err.message).toContain("timed out");
      }
    });

    it("throws INVALID_API_KEY when JSON payload contains error code", async () => {
      const service = new TikWApiService();
      vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: -1,
          msg: "API key expired or invalid",
        }),
      } as any);

      try {
        await service.fetchTrendingVideos();
      } catch (err: any) {
        expect(err.code).toBe("INVALID_API_KEY");
        expect(err.message).toBe("API key expired or invalid");
      }
    });
  });

  describe("GET Method Support", () => {
    it("sends request as GET with URL query parameters when method is configured as GET", async () => {
      const service = new TikWApiService({
        apiKey: "get_key_123",
        method: "GET",
      });

      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => ({ code: 0, data: [] }),
      } as any);

      await service.fetchTrendingVideos("VN", 10);

      expect(fetchSpy).toHaveBeenCalledWith(
        "https://api.tikwmapi.com/api/feed/list?region=VN&count=10",
        expect.objectContaining({
          method: "GET",
          body: undefined,
        })
      );
    });
  });

  describe("Integration with TiktokTrendService", () => {
    it("TiktokTrendService uses TikWApiService when apiKey is present and maps to ViralContentCandidate", async () => {
      const tikwApiMock = new TikWApiService({ apiKey: "active-secret-key" });

      const mockVideos: ViralVideoItem[] = [
        {
          id: "video_999",
          title: "Clip triệu view Torriden siêu hot",
          videoUrl: "https://api.tikwmapi.com/clean.mp4",
          coverUrl: "https://api.tikwmapi.com/cover.jpg",
          views: 300000,
          likes: 25000,
          comments: 800,
          shares: 1200,
          authorName: "Beauty Queen",
          authorUsername: "beauty_queen",
          duration: 30,
        },
      ];

      vi.spyOn(tikwApiMock, "fetchTrendingVideos").mockResolvedValueOnce(mockVideos);

      const trendService = new TiktokTrendService(tikwApiMock);
      const candidates = await trendService.fetchTrendingVideos({ region: "VN" });

      expect(candidates).toHaveLength(1);
      const cand = candidates[0];
      expect(cand.id).toBe("video_999");
      expect(cand.title).toBe("Clip triệu view Torriden siêu hot");
      expect(cand.videoUrl).toBe("https://api.tikwmapi.com/clean.mp4");
      expect(cand.stats.views).toBe(300000);
      expect(cand.author.uniqueId).toBe("beauty_queen");
      expect(cand.suggestedThreadsCaption).toBeTruthy();
    });

    it("TiktokTrendService falls back to public endpoint if TikWApiService throws", async () => {
      const tikwApiMock = new TikWApiService({ apiKey: "rate-limited-key" });
      vi.spyOn(tikwApiMock, "fetchTrendingVideos").mockRejectedValueOnce(
        new TikWApiError("Rate limit exceeded", "RATE_LIMITED", 429)
      );

      const trendService = new TiktokTrendService(tikwApiMock);

      // Spy on global fetch for public fallback
      const fallbackSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 0,
          data: [
            {
              video_id: "fallback_video_1",
              title: "Fallback video item",
              play: "https://v16.tiktokcdn.com/fallback.mp4",
              cover: "https://p16.tiktokcdn.com/fallback.jpg",
              play_count: 60000,
              digg_count: 3000,
            },
          ],
        }),
      } as any);

      const candidates = await trendService.fetchTrendingVideos();

      expect(fallbackSpy).toHaveBeenCalledTimes(1);
      expect(candidates).toHaveLength(1);
      expect(candidates[0].id).toBe("fallback_video_1");
    });
  });
});
