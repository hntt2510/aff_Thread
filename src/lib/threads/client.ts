import { sanitizeString } from "@/lib/errors/sanitizer";

export type ThreadsErrorCode =
  | "INVALID_TOKEN"
  | "PERMISSION_ERROR"
  | "RATE_LIMIT"
  | "NETWORK_ERROR"
  | "API_ERROR";

export type ThreadsMediaType = "TEXT" | "IMAGE" | "VIDEO" | "CAROUSEL";
export type ThreadsContainerStatus = "FINISHED" | "IN_PROGRESS" | "ERROR" | "EXPIRED";

export class ThreadsApiError extends Error {
  code: ThreadsErrorCode;
  status: number;

  constructor(code: ThreadsErrorCode, message: string, status = 400) {
    super(sanitizeString(message));
    this.name = "ThreadsApiError";
    this.code = code;
    this.status = status;
  }
}

export interface ThreadsProfile {
  id: string;
  username: string;
  name: string;
  threads_profile_picture_url?: string;
  threads_biography?: string;
}

export interface ThreadsMetricValue {
  value: number;
}

export interface ThreadsInsightItem {
  name: string;
  period?: string;
  values?: ThreadsMetricValue[];
  title?: string;
  description?: string;
  id?: string;
}

export interface ThreadsPostInsights {
  views: number | null;
  likes: number | null;
  replies: number | null;
  reposts: number | null;
  quotes: number | null;
  shares: number | null;
  rawMetricsJson: Record<string, unknown>;
}

export interface ThreadsConversationReply {
  id: string;
  text?: string;
  username?: string;
  timestamp?: string;
  is_reply?: boolean;
}

export class ThreadsClient {
  private baseUrl = "https://graph.threads.net/v1.0";

  /**
   * Fetches official profile identity using HTTP Bearer Authorization.
   * Endpoint: GET /me?fields=id,username,name,threads_profile_picture_url,threads_biography
   * Note: The access token is NEVER included in the URL or query parameters.
   */
  async getProfile(accessToken: string): Promise<ThreadsProfile> {
    if (!accessToken || !accessToken.trim()) {
      throw new ThreadsApiError("INVALID_TOKEN", "Access token cannot be empty", 400);
    }

    const url = new URL(`${this.baseUrl}/me`);
    url.searchParams.set("fields", "id,username,name,threads_profile_picture_url,threads_biography");

    const data = await this.request<{
      id: string;
      username: string;
      name?: string;
      threads_profile_picture_url?: string;
      threads_biography?: string;
    }>(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken.trim()}`,
      },
    });

    if (!data.id || !data.username) {
      throw new ThreadsApiError("API_ERROR", "Threads profile response missing ID or username", 502);
    }

    return {
      id: data.id,
      username: data.username,
      name: data.name || data.username,
      threads_profile_picture_url: data.threads_profile_picture_url,
      threads_biography: data.threads_biography,
    };
  }

  /**
   * Creates a text container for publishing using HTTP Bearer Authorization.
   * Endpoint: POST /me/threads
   * Note: The access token is NEVER included in the request body or URL.
   */
  async createTextContainer(accessToken: string, text: string): Promise<{ id: string }> {
    if (!accessToken || !accessToken.trim()) {
      throw new ThreadsApiError("INVALID_TOKEN", "Access token cannot be empty", 400);
    }

    if (!text || !text.trim()) {
      throw new ThreadsApiError("API_ERROR", "Text content cannot be empty", 400);
    }

    const url = `${this.baseUrl}/me/threads`;
    const params = new URLSearchParams();
    params.set("media_type", "TEXT");
    params.set("text", text);

    const data = await this.request<{ id: string }>(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Bearer ${accessToken.trim()}`,
      },
      body: params.toString(),
    });

    if (!data.id) {
      throw new ThreadsApiError("API_ERROR", "Failed to retrieve container ID from Threads", 502);
    }

    return { id: data.id };
  }

  /**
   * Creates an image container for publishing.
   * Endpoint: POST /me/threads
   */
  async createImageContainer(
    accessToken: string,
    imageUrl: string,
    text?: string,
    altText?: string
  ): Promise<{ id: string }> {
    if (!accessToken || !accessToken.trim()) {
      throw new ThreadsApiError("INVALID_TOKEN", "Access token cannot be empty", 400);
    }
    if (!imageUrl || !imageUrl.trim()) {
      throw new ThreadsApiError("API_ERROR", "Image URL cannot be empty", 400);
    }

    const url = `${this.baseUrl}/me/threads`;
    const params = new URLSearchParams();
    params.set("media_type", "IMAGE");
    params.set("image_url", imageUrl.trim());
    if (text && text.trim()) {
      params.set("text", text);
    }
    if (altText && altText.trim()) {
      params.set("alt_text", altText.trim());
    }

    const data = await this.request<{ id: string }>(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Bearer ${accessToken.trim()}`,
      },
      body: params.toString(),
    });

    if (!data.id) {
      throw new ThreadsApiError("API_ERROR", "Failed to retrieve image container ID from Threads", 502);
    }

    return { id: data.id };
  }

  /**
   * Creates a video container for publishing.
   * Endpoint: POST /me/threads
   */
  async createVideoContainer(
    accessToken: string,
    videoUrl: string,
    text?: string,
    altText?: string
  ): Promise<{ id: string }> {
    if (!accessToken || !accessToken.trim()) {
      throw new ThreadsApiError("INVALID_TOKEN", "Access token cannot be empty", 400);
    }
    if (!videoUrl || !videoUrl.trim()) {
      throw new ThreadsApiError("API_ERROR", "Video URL cannot be empty", 400);
    }

    const url = `${this.baseUrl}/me/threads`;
    const params = new URLSearchParams();
    params.set("media_type", "VIDEO");
    params.set("video_url", videoUrl.trim());
    if (text && text.trim()) {
      params.set("text", text);
    }
    if (altText && altText.trim()) {
      params.set("alt_text", altText.trim());
    }

    const data = await this.request<{ id: string }>(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Bearer ${accessToken.trim()}`,
      },
      body: params.toString(),
    });

    if (!data.id) {
      throw new ThreadsApiError("API_ERROR", "Failed to retrieve video container ID from Threads", 502);
    }

    return { id: data.id };
  }

  /**
   * Creates an item container for use inside a carousel.
   * Endpoint: POST /me/threads with is_carousel_item=true
   */
  async createCarouselItemContainer(
    accessToken: string,
    mediaKind: "IMAGE" | "VIDEO",
    sourceUrl: string,
    altText?: string
  ): Promise<{ id: string }> {
    if (!accessToken || !accessToken.trim()) {
      throw new ThreadsApiError("INVALID_TOKEN", "Access token cannot be empty", 400);
    }
    if (!sourceUrl || !sourceUrl.trim()) {
      throw new ThreadsApiError("API_ERROR", "Media source URL cannot be empty", 400);
    }

    const url = `${this.baseUrl}/me/threads`;
    const params = new URLSearchParams();
    params.set("media_type", mediaKind);
    if (mediaKind === "IMAGE") {
      params.set("image_url", sourceUrl.trim());
    } else {
      params.set("video_url", sourceUrl.trim());
    }
    params.set("is_carousel_item", "true");
    if (altText && altText.trim()) {
      params.set("alt_text", altText.trim());
    }

    const data = await this.request<{ id: string }>(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Bearer ${accessToken.trim()}`,
      },
      body: params.toString(),
    });

    if (!data.id) {
      throw new ThreadsApiError("API_ERROR", "Failed to retrieve carousel item container ID from Threads", 502);
    }

    return { id: data.id };
  }

  /**
   * Creates a carousel parent container containing 2 to 10 child item containers.
   * Endpoint: POST /me/threads
   */
  async createCarouselContainer(
    accessToken: string,
    childrenContainerIds: string[],
    text?: string
  ): Promise<{ id: string }> {
    if (!accessToken || !accessToken.trim()) {
      throw new ThreadsApiError("INVALID_TOKEN", "Access token cannot be empty", 400);
    }
    if (!childrenContainerIds || childrenContainerIds.length < 2 || childrenContainerIds.length > 10) {
      throw new ThreadsApiError("API_ERROR", "Carousel must contain between 2 and 10 child containers", 400);
    }

    const url = `${this.baseUrl}/me/threads`;
    const params = new URLSearchParams();
    params.set("media_type", "CAROUSEL");
    params.set("children", childrenContainerIds.join(","));
    if (text && text.trim()) {
      params.set("text", text);
    }

    const data = await this.request<{ id: string }>(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Bearer ${accessToken.trim()}`,
      },
      body: params.toString(),
    });

    if (!data.id) {
      throw new ThreadsApiError("API_ERROR", "Failed to retrieve carousel container ID from Threads", 502);
    }

    return { id: data.id };
  }

  /**
   * Retrieves status of an asynchronous media container.
   * Endpoint: GET /{containerId}?fields=id,status,error_message
   */
  async getContainerStatus(
    accessToken: string,
    containerId: string
  ): Promise<{ id: string; status: ThreadsContainerStatus; errorMessage?: string }> {
    if (!accessToken || !accessToken.trim()) {
      throw new ThreadsApiError("INVALID_TOKEN", "Access token cannot be empty", 400);
    }
    if (!containerId || !containerId.trim()) {
      throw new ThreadsApiError("API_ERROR", "Container ID is required", 400);
    }

    const url = new URL(`${this.baseUrl}/${encodeURIComponent(containerId.trim())}`);
    url.searchParams.set("fields", "id,status,error_message");

    const data = await this.request<{
      id: string;
      status: ThreadsContainerStatus;
      error_message?: string;
    }>(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken.trim()}`,
      },
    });

    return {
      id: data.id,
      status: data.status || "FINISHED",
      errorMessage: data.error_message,
    };
  }

  /**
   * Bounded readiness check for video or media containers.
   * Safe for serverless execution: bounded polling to avoid timeout.
   */
  async waitForContainerReady(
    accessToken: string,
    containerId: string,
    maxWaitMs = 12000,
    pollIntervalMs = 2000
  ): Promise<{ ready: boolean; status: ThreadsContainerStatus; errorMessage?: string }> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      const statusRes = await this.getContainerStatus(accessToken, containerId);

      if (statusRes.status === "FINISHED") {
        return { ready: true, status: "FINISHED" };
      }

      if (statusRes.status === "ERROR" || statusRes.status === "EXPIRED") {
        throw new ThreadsApiError(
          "API_ERROR",
          statusRes.errorMessage || `Media container processing ended in ${statusRes.status}`,
          500
        );
      }

      // Still IN_PROGRESS, wait before next check if we have enough time remaining
      const remainingMs = maxWaitMs - (Date.now() - startTime);
      if (remainingMs <= pollIntervalMs) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    // Timed out for this synchronous run, return status for async deferred handling
    return { ready: false, status: "IN_PROGRESS" };
  }

  /**
   * Publishes a previously created container using HTTP Bearer Authorization.
   * Endpoint: POST /me/threads_publish
   * Note: The access token is NEVER included in the request body or URL.
   */
  async publishContainer(accessToken: string, creationId: string): Promise<{ id: string }> {
    if (!accessToken || !accessToken.trim()) {
      throw new ThreadsApiError("INVALID_TOKEN", "Access token cannot be empty", 400);
    }

    if (!creationId || !creationId.trim()) {
      throw new ThreadsApiError("API_ERROR", "Creation container ID is required", 400);
    }

    const url = `${this.baseUrl}/me/threads_publish`;
    const params = new URLSearchParams();
    params.set("creation_id", creationId);

    const data = await this.request<{ id: string }>(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Bearer ${accessToken.trim()}`,
      },
      body: params.toString(),
    });

    if (!data.id) {
      throw new ThreadsApiError("API_ERROR", "Failed to retrieve published post ID from Threads", 502);
    }

    return { id: data.id };
  }

  /**
   * Fetches official post insights using HTTP Bearer Authorization.
   * Endpoint: GET /{threadsMediaId}/insights?metric=views,likes,replies,reposts,quotes,shares
   * Note: The access token is NEVER included in query params or URLs.
   */
  async getPostInsights(
    accessToken: string,
    threadsMediaId: string,
    metrics: string[] = ["views", "likes", "replies", "reposts", "quotes", "shares"]
  ): Promise<ThreadsPostInsights> {
    if (!accessToken || !accessToken.trim()) {
      throw new ThreadsApiError("INVALID_TOKEN", "Access token cannot be empty", 400);
    }
    if (!threadsMediaId || !threadsMediaId.trim()) {
      throw new ThreadsApiError("API_ERROR", "Threads media ID cannot be empty", 400);
    }

    const url = new URL(`${this.baseUrl}/${encodeURIComponent(threadsMediaId.trim())}/insights`);
    url.searchParams.set("metric", metrics.join(","));

    const data = await this.request<{
      data?: ThreadsInsightItem[];
    }>(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken.trim()}`,
      },
    });

    const items = data.data || [];
    const metricMap: Record<string, number | null> = {
      views: null,
      likes: null,
      replies: null,
      reposts: null,
      quotes: null,
      shares: null,
    };
    const rawMetricsJson: Record<string, unknown> = {};

    for (const item of items) {
      if (!item.name) continue;
      rawMetricsJson[item.name] = item;
      const firstVal = item.values?.[0]?.value;
      if (typeof firstVal === "number") {
        metricMap[item.name] = firstVal;
      }
    }

    return {
      views: metricMap.views,
      likes: metricMap.likes,
      replies: metricMap.replies,
      reposts: metricMap.reposts,
      quotes: metricMap.quotes,
      shares: metricMap.shares,
      rawMetricsJson,
    };
  }

  /**
   * Creates a reply container to a parent Threads post using HTTP Bearer Authorization.
   * Endpoint: POST /me/threads with reply_to_id
   * Supports TEXT, or media reply if provided.
   */
  async createReplyContainer(
    accessToken: string,
    replyToId: string,
    text: string,
    mediaKind?: "TEXT" | "IMAGE" | "VIDEO",
    mediaUrl?: string
  ): Promise<{ id: string }> {
    if (!accessToken || !accessToken.trim()) {
      throw new ThreadsApiError("INVALID_TOKEN", "Access token cannot be empty", 400);
    }
    if (!replyToId || !replyToId.trim()) {
      throw new ThreadsApiError("API_ERROR", "reply_to_id cannot be empty", 400);
    }
    if (!text || !text.trim()) {
      throw new ThreadsApiError("API_ERROR", "Reply text cannot be empty", 400);
    }

    const url = `${this.baseUrl}/me/threads`;
    const params = new URLSearchParams();
    params.set("reply_to_id", replyToId.trim());
    params.set("media_type", mediaKind || "TEXT");
    params.set("text", text);

    if (mediaKind === "IMAGE" && mediaUrl) {
      params.set("image_url", mediaUrl.trim());
    } else if (mediaKind === "VIDEO" && mediaUrl) {
      params.set("video_url", mediaUrl.trim());
    }

    const data = await this.request<{ id: string }>(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Bearer ${accessToken.trim()}`,
      },
      body: params.toString(),
    });

    if (!data.id) {
      throw new ThreadsApiError("API_ERROR", "Failed to retrieve reply container ID from Threads", 502);
    }

    return { id: data.id };
  }

  /**
   * Retrieves conversation replies for a Threads post to enable idempotent verification
   * and reconciliation of ambiguous publishing results.
   * Endpoint: GET /{threadsMediaId}/conversation?fields=id,text,username,timestamp,is_reply
   */
  async getConversationReplies(
    accessToken: string,
    threadsMediaId: string,
    fields: string[] = ["id", "text", "username", "timestamp", "is_reply"]
  ): Promise<ThreadsConversationReply[]> {
    if (!accessToken || !accessToken.trim()) {
      throw new ThreadsApiError("INVALID_TOKEN", "Access token cannot be empty", 400);
    }
    if (!threadsMediaId || !threadsMediaId.trim()) {
      throw new ThreadsApiError("API_ERROR", "threadsMediaId cannot be empty", 400);
    }

    const url = new URL(`${this.baseUrl}/${encodeURIComponent(threadsMediaId.trim())}/conversation`);
    url.searchParams.set("fields", fields.join(","));
    url.searchParams.set("reverse", "true");

    const data = await this.request<{
      data?: ThreadsConversationReply[];
    }>(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken.trim()}`,
      },
    });

    return data.data || [];
  }

  private async request<T>(url: string, init: RequestInit): Promise<T> {
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (err) {
      throw new ThreadsApiError(
        "NETWORK_ERROR",
        "Network connection to Threads API failed",
        503
      );
    }

    let json: { error?: { message?: string; type?: string; code?: number; error_subcode?: number } } & T;
    try {
      json = await res.json();
    } catch {
      if (!res.ok) {
        throw new ThreadsApiError("API_ERROR", `Threads API returned HTTP ${res.status}`, res.status);
      }
      throw new ThreadsApiError("API_ERROR", "Failed to parse JSON response from Threads API", 502);
    }

    if (!res.ok || json.error) {
      const errorObj = json.error || {};
      const msg = errorObj.message || `Threads API HTTP error ${res.status}`;
      const code = errorObj.code;

      // Meta error classification
      let errorCode: ThreadsErrorCode = "API_ERROR";
      if (
        code === 190 ||
        res.status === 401 ||
        msg.toLowerCase().includes("oauth") ||
        msg.toLowerCase().includes("token")
      ) {
        errorCode = "INVALID_TOKEN";
      } else if (code === 10 || code === 200 || res.status === 403) {
        errorCode = "PERMISSION_ERROR";
      } else if (code === 4 || code === 17 || code === 32 || code === 613 || res.status === 429) {
        errorCode = "RATE_LIMIT";
      }

      throw new ThreadsApiError(errorCode, msg, res.status);
    }

    return json as T;
  }
}

export const threadsClient = new ThreadsClient();
