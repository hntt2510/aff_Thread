/**
 * TikTok / Douyin Viral Video Trend Discovery Service.
 * Fetches trending and keyword-searched videos via TikWM public API,
 * filters by viral engagement thresholds, and extracts clean, watermark-free MP4 URLs.
 */

export interface ViralContentCandidate {
  id: string; // Video ID
  title: string; // Raw caption text
  videoUrl: string; // Clean MP4 URL without watermark
  coverUrl: string; // Thumbnail image
  stats: {
    views: number;
    likes: number;
    shares: number;
    comments: number;
  };
  author: {
    uniqueId: string;
    nickname: string;
    avatar?: string;
  };
  duration: number; // in seconds
  region: string;
  createdAt: number;
  engagementScore: number;
  suggestedThreadsCaption: string;
}

export interface FetchTrendOptions {
  region?: string; // default "VN"
  count?: number; // default 20
  minViews?: number; // default 50000
  minLikes?: number; // default 2000
  endpoint?: string;
}

export interface SearchTrendOptions {
  query: string;
  region?: string;
  count?: number;
  minViews?: number;
  minLikes?: number;
  endpoint?: string;
}

import {
  tikWApiService,
  TikWApiService,
  ViralVideoItem,
} from "./tikw-api.service";

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

export class TiktokTrendService {
  readonly version = "v1.0.0-trend-discovery";
  private readonly feedListEndpoint = "https://www.tikwm.com/api/feed/list";
  private readonly feedSearchEndpoint = "https://www.tikwm.com/api/feed/search/";
  private tikwApi: TikWApiService;

  constructor(tikwApi: TikWApiService = tikWApiService) {
    this.tikwApi = tikwApi;
  }

  /**
   * Fetches trending videos for a specified region (default: "VN").
   * Prioritizes official TikW-API if TIKW_API_KEY is configured.
   */
  async fetchTrendingVideos(options?: FetchTrendOptions): Promise<ViralContentCandidate[]> {
    const region = options?.region || "VN";
    const count = options?.count || 20;
    const minViews = options?.minViews ?? 50000;
    const minLikes = options?.minLikes ?? 2000;
    const endpoint = options?.endpoint;

    // Use official TikW-API if API key is present and no custom endpoint override was specified
    if (!endpoint && this.tikwApi?.getApiKey()) {
      try {
        const items = await this.tikwApi.fetchTrendingVideos(region, count);
        const candidates = items.map((it) => this.mapViralVideoItemToCandidate(it, region));
        return this.rankAndFilterCandidates(candidates, minViews, minLikes);
      } catch (err) {
        console.warn("TikW-API trending fetch failed, falling back to public endpoint:", err);
      }
    }

    const publicEndpoint = endpoint || this.feedListEndpoint;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(publicEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": DEFAULT_USER_AGENT,
          Accept: "application/json",
        },
        body: new URLSearchParams({
          region,
          count: String(count),
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        return [];
      }

      const json = await res.json();
      const rawVideos: any[] = Array.isArray(json.data)
        ? json.data
        : Array.isArray(json.data?.videos)
        ? json.data.videos
        : [];

      return this.processRawVideos(rawVideos, { region, minViews, minLikes });
    } catch {
      return [];
    }
  }

  /**
   * Searches viral videos matching a query keyword.
   * Prioritizes official TikW-API if TIKW_API_KEY is configured.
   */
  async searchViralVideos(options: SearchTrendOptions): Promise<ViralContentCandidate[]> {
    const { query } = options;
    if (!query || !query.trim()) {
      return this.fetchTrendingVideos(options);
    }

    const count = options.count || 20;
    const region = options.region || "VN";
    const minViews = options.minViews ?? 50000;
    const minLikes = options.minLikes ?? 2000;
    const endpoint = options.endpoint;

    // Use official TikW-API if API key is present and no custom endpoint override was specified
    if (!endpoint && this.tikwApi?.getApiKey()) {
      try {
        const items = await this.tikwApi.searchViralVideos(query.trim(), count);
        const candidates = items.map((it) => this.mapViralVideoItemToCandidate(it, region));
        return this.rankAndFilterCandidates(candidates, minViews, minLikes);
      } catch (err) {
        console.warn("TikW-API search failed, falling back to public endpoint:", err);
      }
    }

    const publicEndpoint = endpoint || this.feedSearchEndpoint;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(publicEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": DEFAULT_USER_AGENT,
          Accept: "application/json",
        },
        body: new URLSearchParams({
          keywords: query.trim(),
          count: String(count),
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        return [];
      }

      const json = await res.json();
      const rawVideos: any[] = Array.isArray(json.data?.videos)
        ? json.data.videos
        : Array.isArray(json.data)
        ? json.data
        : [];

      return this.processRawVideos(rawVideos, { region, minViews, minLikes });
    } catch {
      return [];
    }
  }

  /**
   * Filters and normalizes raw TikWM video objects into standard ViralContentCandidates.
   */
  processRawVideos(
    rawVideos: any[],
    options: { region: string; minViews: number; minLikes: number }
  ): ViralContentCandidate[] {
    if (!rawVideos || !Array.isArray(rawVideos)) return [];

    const candidates: ViralContentCandidate[] = [];

    for (const v of rawVideos) {
      const id = String(v.video_id ?? v.id ?? "").trim();
      if (!id) continue;

      const rawPlay = v.play || v.wmplay;
      if (!rawPlay) continue;

      const videoUrl = rawPlay.startsWith("/") ? `https://www.tikwm.com${rawPlay}` : rawPlay;
      const rawCover = v.cover || v.origin_cover || "";
      const coverUrl = rawCover.startsWith("/") ? `https://www.tikwm.com${rawCover}` : rawCover;

      const title = String(v.title || v.content_desc || "").trim();
      const views = Number(v.play_count || 0);
      const likes = Number(v.digg_count || 0);
      const shares = Number(v.share_count || 0);
      const comments = Number(v.comment_count || 0);
      const duration = Number(v.duration || 0);
      const createdAt = Number(v.create_time || Date.now());

      const authorUniqueId = String(v.author?.unique_id || v.author?.id || "tiktok_creator");
      const authorNickname = String(v.author?.nickname || authorUniqueId);
      const authorAvatar = v.author?.avatar || undefined;

      // Engagement Score: weighted sum of likes, comments, and shares
      const engagementScore = likes + comments * 2 + shares * 3;

      const suggestedThreadsCaption = this.rewriteCaptionForThreads(title, {
        author: authorNickname,
      });

      candidates.push({
        id,
        title,
        videoUrl,
        coverUrl,
        stats: { views, likes, shares, comments },
        author: {
          uniqueId: authorUniqueId,
          nickname: authorNickname,
          avatar: authorAvatar,
        },
        duration,
        region: options.region,
        createdAt,
        engagementScore,
        suggestedThreadsCaption,
      });
    }

    return this.rankAndFilterCandidates(candidates, options.minViews, options.minLikes);
  }

  /**
   * Converts a normalized ViralVideoItem from TikW-API into a ViralContentCandidate.
   */
  mapViralVideoItemToCandidate(item: ViralVideoItem, region = "VN"): ViralContentCandidate {
    const engagementScore = item.likes + item.comments * 2 + item.shares * 3;
    const suggestedThreadsCaption = this.rewriteCaptionForThreads(item.title, {
      author: item.authorName,
    });

    return {
      id: item.id,
      title: item.title,
      videoUrl: item.videoUrl,
      coverUrl: item.coverUrl,
      stats: {
        views: item.views,
        likes: item.likes,
        shares: item.shares,
        comments: item.comments,
      },
      author: {
        uniqueId: item.authorUsername,
        nickname: item.authorName,
        avatar: item.authorAvatar,
      },
      duration: item.duration ?? 0,
      region,
      createdAt: item.createdAt ?? Date.now(),
      engagementScore,
      suggestedThreadsCaption,
    };
  }

  /**
   * Filters candidates by minimal engagement thresholds and sorts descending by engagement score.
   */
  rankAndFilterCandidates(
    candidates: ViralContentCandidate[],
    minViews: number,
    minLikes: number
  ): ViralContentCandidate[] {
    // Filter by minimal engagement: views >= minViews OR likes >= minLikes
    const filtered = candidates.filter(
      (c) => c.stats.views >= minViews || c.stats.likes >= minLikes
    );

    // If filtering eliminates all items (e.g. narrow search), fallback to top candidates
    const results = filtered.length > 0 ? filtered : candidates;

    // Sort descending by engagement score
    results.sort((a, b) => b.engagementScore - a.engagementScore);

    return results;
  }

  /**
   * Rewrites a raw TikTok caption into an engaging, conversational Vietnamese Threads hook.
   * Strips hashtag spam (#xh, #fyp, #trending) and mentions, framing the post as discussion bait.
   */
  rewriteCaptionForThreads(rawCaption: string, options?: { author?: string }): string {
    if (!rawCaption || !rawCaption.trim()) {
      return "Lướt thấy clip này cuốn quá mọi người ơi! Có ai đã thử cái này chưa cho mình xin tí review chân thật với 👇";
    }

    // 1. Remove hashtags (#xyz) and user mentions (@xyz)
    let cleaned = rawCaption
      .replace(/#[^\s#]+/g, "")
      .replace(/@[^\s@]+/g, "")
      .replace(/\s+/g, " ")
      .trim();

    // 2. Remove trailing ellipsis or punctuation clutter
    cleaned = cleaned.replace(/[.]{3,}$/, "").trim();

    // 3. Conversational bait hook templates for Vietnamese Threads
    const hookTemplates = [
      `Lướt tóp tóp thấy quả này cuốn quá mọi người ơi. Có ai dùng rồi cho xin review thật với:\n\n"${cleaned}"\n\nBác nào trải nghiệm rồi cho xin tí ý kiến ở dưới với nha 👇`,
      `Thấy video này đang rần rần mấy hôm nay mà phân vân ghê:\n\n"${cleaned}"\n\nCó bạn nào thử qua rồi confirm giùm mình xem có êm như đồn không ạ? 👀`,
      `Không nghĩ cái này lại viral dữ vậy luôn á cả nhà:\n\n"${cleaned}"\n\nAi xài qua rồi cho xin lời khuyên có nên chốt không với nhé!`,
      `Dạo này thấy món này xuất hiện liên tục trên feed:\n\n"${cleaned}"\n\nReview chân thật giùm mình với mọi người ơi 👇`,
    ];

    // Pick deterministic template based on caption length
    const idx = Math.abs(cleaned.length) % hookTemplates.length;
    const formatted = hookTemplates[idx];

    // Ensure under Threads character limit (500 chars)
    if (formatted.length > 490) {
      return `${formatted.slice(0, 485)}... 👇`;
    }

    return formatted;
  }
}

export const tiktokTrendService = new TiktokTrendService();
