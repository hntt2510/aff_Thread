import { describe, it, expect, vi, beforeEach } from "vitest";
import { ThreadsClient, ThreadsApiError } from "@/lib/threads/client";

describe("Threads API Client", () => {
  let client: ThreadsClient;

  beforeEach(() => {
    client = new ThreadsClient();
    vi.restoreAllMocks();
  });

  it("successfully retrieves and parses profile from Meta Graph API", async () => {
    const mockProfileResponse = {
      id: "17841400000000001",
      username: "affiliate_tester_1",
      name: "Tester One",
      threads_profile_picture_url: "https://cdn.example.com/avatar.jpg",
      threads_biography: "Test bio for affiliate",
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockProfileResponse,
    } as Response);

    const profile = await client.getProfile("valid_token_123");

    expect(profile.id).toBe("17841400000000001");
    expect(profile.username).toBe("affiliate_tester_1");
    expect(profile.name).toBe("Tester One");
    expect(profile.threads_profile_picture_url).toBe("https://cdn.example.com/avatar.jpg");
    expect(profile.threads_biography).toBe("Test bio for affiliate");
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
    const rawSecretToken = "EAAB_SECRET_ACCESS_TOKEN_1234567890";
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
      expect(err.message).toContain("[REDACTED");
    }
  });

  it("creates text container successfully", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "container_id_9999" }),
    } as Response);

    const res = await client.createTextContainer("token_abc", "Hello Threads!");
    expect(res.id).toBe("container_id_9999");
  });

  it("publishes container successfully", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "threads_post_id_7777" }),
    } as Response);

    const res = await client.publishContainer("token_abc", "container_id_9999");
    expect(res.id).toBe("threads_post_id_7777");
  });
});
