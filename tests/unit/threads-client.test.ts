import { describe, it, expect, vi, beforeEach } from "vitest";
import { ThreadsClient, ThreadsApiError } from "@/lib/threads/client";

describe("Threads API Client", () => {
  let client: ThreadsClient;

  beforeEach(() => {
    client = new ThreadsClient();
    vi.restoreAllMocks();
  });

  it("uses Authorization: Bearer header and does not embed token in GET /me URL", async () => {
    const testToken = "valid_threads_bearer_token_12345";
    let capturedUrl = "";
    let capturedHeaders: Record<string, string> = {};

    global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedHeaders = (init?.headers as Record<string, string>) || {};
      return {
        ok: true,
        json: async () => ({
          id: "17841400000000001",
          username: "affiliate_tester_1",
          name: "Tester One",
          threads_profile_picture_url: "https://cdn.example.com/avatar.jpg",
          threads_biography: "Test bio for affiliate",
        }),
      } as Response;
    });

    const profile = await client.getProfile(testToken);

    // Profile parsed correctly
    expect(profile.id).toBe("17841400000000001");
    expect(profile.username).toBe("affiliate_tester_1");

    // Header assertion
    expect(capturedHeaders.Authorization).toBe(`Bearer ${testToken}`);

    // URL assertion: MUST NOT contain token or access_token param
    expect(capturedUrl).not.toContain(testToken);
    expect(capturedUrl).not.toContain("access_token");
    expect(capturedUrl).toContain("https://graph.threads.net/v1.0/me?fields=");
  });

  it("uses Authorization: Bearer header and does not include token in POST /me/threads body or URL", async () => {
    const testToken = "secret_container_creation_token_999";
    let capturedUrl = "";
    let capturedHeaders: Record<string, string> = {};
    let capturedBody = "";

    global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedHeaders = (init?.headers as Record<string, string>) || {};
      capturedBody = (init?.body as string) || "";
      return {
        ok: true,
        json: async () => ({ id: "container_id_9999" }),
      } as Response;
    });

    const res = await client.createTextContainer(testToken, "Hello Threads Affiliate!");
    expect(res.id).toBe("container_id_9999");

    // Header assertion
    expect(capturedHeaders.Authorization).toBe(`Bearer ${testToken}`);

    // URL assertion
    expect(capturedUrl).toBe("https://graph.threads.net/v1.0/me/threads");
    expect(capturedUrl).not.toContain(testToken);

    // Body assertion: Only media_type and text, NO access_token
    expect(capturedBody).not.toContain(testToken);
    expect(capturedBody).not.toContain("access_token");
    const bodyParams = new URLSearchParams(capturedBody);
    expect(bodyParams.get("media_type")).toBe("TEXT");
    expect(bodyParams.get("text")).toBe("Hello Threads Affiliate!");
    expect(bodyParams.get("access_token")).toBeNull();
  });

  it("uses Authorization: Bearer header and does not include token in POST /me/threads_publish body or URL", async () => {
    const testToken = "secret_publish_token_777";
    let capturedUrl = "";
    let capturedHeaders: Record<string, string> = {};
    let capturedBody = "";

    global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedHeaders = (init?.headers as Record<string, string>) || {};
      capturedBody = (init?.body as string) || "";
      return {
        ok: true,
        json: async () => ({ id: "threads_post_id_7777" }),
      } as Response;
    });

    const res = await client.publishContainer(testToken, "container_id_9999");
    expect(res.id).toBe("threads_post_id_7777");

    // Header assertion
    expect(capturedHeaders.Authorization).toBe(`Bearer ${testToken}`);

    // URL assertion
    expect(capturedUrl).toBe("https://graph.threads.net/v1.0/me/threads_publish");
    expect(capturedUrl).not.toContain(testToken);

    // Body assertion: Only creation_id, NO access_token
    expect(capturedBody).not.toContain(testToken);
    expect(capturedBody).not.toContain("access_token");
    const bodyParams = new URLSearchParams(capturedBody);
    expect(bodyParams.get("creation_id")).toBe("container_id_9999");
    expect(bodyParams.get("access_token")).toBeNull();
  });

  it("normalizes Meta OAuth error to INVALID_TOKEN", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        error: {
          message: "Error validating access token: Session has expired",
          type: "OAuthException",
          code: 190,
        },
      }),
    } as Response);

    await expect(client.getProfile("expired_token")).rejects.toThrowError(
      expect.objectContaining({
        name: "ThreadsApiError",
        code: "INVALID_TOKEN",
      })
    );
  });

  it("normalizes Meta rate limit error to RATE_LIMIT", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({
        error: {
          message: "Application request limit reached",
          type: "OAuthException",
          code: 4,
        },
      }),
    } as Response);

    await expect(client.getProfile("rate_limited_token")).rejects.toThrowError(
      expect.objectContaining({
        name: "ThreadsApiError",
        code: "RATE_LIMIT",
      })
    );
  });

  it("normalizes fetch network failure to NETWORK_ERROR", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED"));

    await expect(client.getProfile("any_token")).rejects.toThrowError(
      expect.objectContaining({
        name: "ThreadsApiError",
        code: "NETWORK_ERROR",
      })
    );
  });

  it("never includes token in thrown error message", async () => {
    const rawSecretToken = "THAA_SECRET_ACCESS_TOKEN_XYZ_1234567890";
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: {
          message: `Invalid access_token=${rawSecretToken}`,
          code: 190,
        },
      }),
    } as Response);

    try {
      await client.getProfile(rawSecretToken);
      expect.unreachable("Should have thrown");
    } catch (err: any) {
      expect(err).toBeInstanceOf(ThreadsApiError);
      expect(err.message).not.toContain(rawSecretToken);
      expect(err.message).toContain("[REDACTED]");
    }
  });
});
