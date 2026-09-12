/**
 * Official TikW-API Service (tikwmapi.com).
 * Integrates with developer API https://api.tikwmapi.com using API Key authentication.
 * Provides clean watermark-free video retrieval, keyword search, and normalized ViralVideoItems.
 */

export interface ViralVideoItem {
  id: string;
  title: string;
  videoUrl: string; // clean MP4 from 'play'
  coverUrl: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  authorName: string;
  authorUsername: string;
  duration?: number;
  createdAt?: number;
  authorAvatar?: string;
}

export type TikWApiErrorCode =
  | "INVALID_API_KEY"
  | "RATE_LIMITED"
  | "SERVER_ERROR"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "BAD_REQUEST"
  | "NOT_FOUND";

export class TikWApiError extends Error {
  readonly code: TikWApiErrorCode;
  readonly status?: number;

  constructor(message: string, code: TikWApiErrorCode, status?: number) {
    super(message);
    this.name = "TikWApiError";
    this.code = code;
    this.status = status;
  }
}

export interface TikWApiOptions {
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  method?: "POST" | "GET";
}

const DEFAULT_BASE_URL = "https://api.tikwmapi.com";
const DEFAULT_TIMEOUT_MS = 15000; // 15 seconds

export class TikWApiService {
  readonly version = "v1.0.0-tikw-api";
  private baseUrl: string;
  private apiKey?: string;
  private timeoutMs: number;
  private httpMethod: "POST" | "GET";

  constructor(options?: TikWApiOptions) {
    this.baseUrl = options?.baseUrl || process.env.TIKW_API_BASE_URL || DEFAULT_BASE_URL;
    this.apiKey = options?.apiKey || process.env.TIKW_API_KEY;
    this.timeoutMs = options?.timeoutMs || DEFAULT_TIMEOUT_MS;
    this.httpMethod = options?.method || "POST";
  }

  /**
   * Returns current configured API Key.
   */
  getApiKey(): string | undefined {
    return this.apiKey || process.env.TIKW_API_KEY;
  }

  /**
   * Sets or overrides the API key.
   */
  setApiKey(key: string): void {
    this.apiKey = key;
  }

  /**
   * Fetches trending videos by region (default: "VN").
   * Calls endpoint: /api/feed/list
   */
  async fetchTrendingVideos(region = "VN", count = 20): Promise<ViralVideoItem[]> {
    const endpoint = `${this.baseUrl}/api/feed/list`;
    const params = new URLSearchParams({
      region,
      count: String(count),
    });

    const data = await this.request(endpoint, params);
    const rawVideos = Array.isArray(data)
      ? data
      : Array.isArray(data?.videos)
      ? data.videos
      : [];
    return this.normalizeVideos(rawVideos);
  }

  /**
   * Searches viral videos by keyword or hashtag.
   * Calls endpoint: /api/feed/search
   */
  async searchViralVideos(
    keyword: string,
    count = 20,
    region = "VN",
    cursor = 0
  ): Promise<ViralVideoItem[]> {
    const endpoint = `${this.baseUrl}/api/feed/search`;
    const params = new URLSearchParams({
      keywords: keyword.trim(),
      count: String(count),
      region: region || "VN",
      cursor: String(cursor),
    });

    const data = await this.request(endpoint, params);
    const rawVideos = Array.isArray(data?.videos)
      ? data.videos
      : Array.isArray(data)
      ? data
      : [];
    return this.normalizeVideos(rawVideos);
  }

  /**
   * Core HTTP request handler with authentication headers and categorized error handling.
   */
  private async request(url: string, params: URLSearchParams): Promise<any> {
    const key = this.getApiKey();

    const headers: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": "aff_Thread/1.0 (TikW-API Client)",
    };

    if (key) {
      headers["x-api-key"] = key;
      headers["Authorization"] = `Bearer ${key}`;
    }

    const isGet = this.httpMethod === "GET";
    const requestUrl = isGet ? `${url}?${params.toString()}` : url;

    if (!isGet) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let res: Response;
    try {
      res = await fetch(requestUrl, {
        method: this.httpMethod,
        headers,
        body: isGet ? undefined : params,
        signal: controller.signal,
      });
    } catch (err: any) {
      clearTimeout(timer);
      if (err.name === "AbortError") {
        throw new TikWApiError(
          `Request to TikW-API timed out after ${this.timeoutMs}ms`,
          "TIMEOUT"
        );
      }
      throw new TikWApiError(
        `Network error connecting to TikW-API: ${err.message}`,
        "NETWORK_ERROR"
      );
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new TikWApiError(
          "Invalid or missing TikW-API key. Please verify TIKW_API_KEY in your environment.",
          "INVALID_API_KEY",
          res.status
        );
      }
      if (res.status === 429) {
        throw new TikWApiError(
          "TikW-API rate limit exceeded. Please wait or upgrade your plan.",
          "RATE_LIMITED",
          res.status
        );
      }
      if (res.status >= 500) {
        throw new TikWApiError(
          `TikW-API server error (HTTP ${res.status}). Service may be temporarily down.`,
          "SERVER_ERROR",
          res.status
        );
      }
      throw new TikWApiError(
        `TikW-API request failed with HTTP status ${res.status}`,
        "BAD_REQUEST",
        res.status
      );
    }

    let json: any;
    try {
      json = await res.json();
    } catch {
      throw new TikWApiError("Failed to parse JSON response from TikW-API", "SERVER_ERROR");
    }

    if (json.code !== undefined && json.code !== 0 && json.code !== "0") {
      const msg = json.msg || json.message || "TikW-API returned error code";
      if (json.code === 401 || json.code === -1) {
        throw new TikWApiError(msg, "INVALID_API_KEY");
      }
      if (json.code === 429) {
        throw new TikWApiError(msg, "RATE_LIMITED");
      }
      throw new TikWApiError(msg, "BAD_REQUEST");
    }

    return json.data !== undefined ? json.data : json;
  }

  /**
   * Normalizes raw API video structures into standard ViralVideoItem format.
   */
  private normalizeVideos(rawVideos: any[]): ViralVideoItem[] {
    if (!rawVideos || !Array.isArray(rawVideos)) return [];

    const items: ViralVideoItem[] = [];

    for (const v of rawVideos) {
      const id = String(v.video_id ?? v.id ?? "").trim();
      if (!id) continue;

      const rawPlay = v.play || v.wmplay;
      if (!rawPlay) continue;

      const videoUrl = rawPlay.startsWith("/") ? `https://api.tikwmapi.com${rawPlay}` : rawPlay;
      const rawCover = v.cover || v.origin_cover || "";
      const coverUrl = rawCover.startsWith("/") ? `https://api.tikwmapi.com${rawCover}` : rawCover;

      const title = String(v.title || v.content_desc || "").trim();
      const views = Number(v.play_count || 0);
      const likes = Number(v.digg_count || 0);
      const comments = Number(v.comment_count || 0);
      const shares = Number(v.share_count || 0);
      const duration = Number(v.duration || 0);
      const createdAt = Number(v.create_time || Date.now());

      const authorUsername = String(v.author?.unique_id || v.author?.id || "creator");
      const authorName = String(v.author?.nickname || authorUsername);
      const authorAvatar = v.author?.avatar || undefined;

      items.push({
        id,
        title,
        videoUrl,
        coverUrl,
        views,
        likes,
        comments,
        shares,
        authorName,
        authorUsername,
        duration,
        createdAt,
        authorAvatar,
      });
    }

    return items;
  }
}

export const tikWApiService = new TikWApiService();
