import { sanitizeString } from "@/lib/errors/sanitizer";

export type ThreadsErrorCode =
  | "INVALID_TOKEN"
  | "PERMISSION_ERROR"
  | "RATE_LIMIT"
  | "NETWORK_ERROR"
  | "API_ERROR";

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
