import { describe, it, expect, vi, beforeEach } from "vitest";
import { ThreadsClient, ThreadsApiError } from "@/lib/threads/client";

describe("Threads Insights & Reply Client", () => {
  let client: ThreadsClient;

  beforeEach(() => {
    client = new ThreadsClient();
    vi.restoreAllMocks();
  });

  it("fetches post insights with Bearer auth and parses metrics safely", async () => {
    const testToken = "valid_threads_bearer_token_12345";
    const mediaId = "18012345678901234";
    let capturedUrl = "";
    let capturedHeaders: Record<string, string> = {};

    global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedHeaders = (init?.headers as Record<string, string>) || {};
      return {
        ok: true,
        json: async () => ({
          data: [
            { name: "views", period: "lifetime", values: [{ value: 1250 }] },
            { name: "likes", period: "lifetime", values: [{ value: 45 }] },
            { name: "replies", period: "lifetime", values: [{ value: 12 }] },
            { name: "reposts", period: "lifetime", values: [{ value: 3 }] },
            { name: "quotes", period: "lifetime", values: [{ value: 1 }] },
          ],
        }),
      } as Response;
    });

    const insights = await client.getPostInsights(testToken, mediaId);

    expect(capturedHeaders.Authorization).toBe(`Bearer ${testToken}`);
    expect(capturedUrl).not.toContain(testToken);
    expect(capturedUrl).toContain(`/${mediaId}/insights?metric=`);

    expect(insights.views).toBe(1250);
    expect(insights.likes).toBe(45);
    expect(insights.replies).toBe(12);
    expect(insights.reposts).toBe(3);
    expect(insights.quotes).toBe(1);
    expect(insights.shares).toBeNull();
    expect(insights.rawMetricsJson.views).toBeDefined();
  });

  it("creates a reply container targeting parent Threads post", async () => {
    const testToken = "test_reply_token_abc";
    const parentId = "18099988877766655";
    const replyText = "Check this deal out: https://s.shopee.vn/test1";

    let capturedUrl = "";
    let capturedHeaders: Record<string, string> = {};
    let capturedBody = "";

    global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedHeaders = (init?.headers as Record<string, string>) || {};
      capturedBody = (init?.body as string) || "";
      return {
        ok: true,
        json: async () => ({ id: "reply_container_998877" }),
      } as Response;
    });

    const result = await client.createReplyContainer(testToken, parentId, replyText);

    expect(result.id).toBe("reply_container_998877");
    expect(capturedUrl).toBe("https://graph.threads.net/v1.0/me/threads");
    expect(capturedHeaders.Authorization).toBe(`Bearer ${testToken}`);
    expect(capturedBody).toContain("reply_to_id=18099988877766655");
    expect(capturedBody).toContain("media_type=TEXT");
    expect(capturedBody).toContain("Check+this+deal+out");
  });

  it("retrieves conversation replies for reconciliation", async () => {
    const testToken = "test_recon_token";
    const parentId = "18099988877766655";

    global.fetch = vi.fn().mockImplementation(async () => {
      return {
        ok: true,
        json: async () => ({
          data: [
            {
              id: "reply_12345",
              text: "Check this deal out: https://s.shopee.vn/test1",
              username: "my_shop_account",
              timestamp: "2026-09-09T12:00:00+0000",
              is_reply: true,
            },
          ],
        }),
      } as Response;
    });

    const replies = await client.getConversationReplies(testToken, parentId);

    expect(replies.length).toBe(1);
    expect(replies[0].id).toBe("reply_12345");
    expect(replies[0].text).toContain("https://s.shopee.vn/test1");
  });

  it("handles and classifies permission error on insights endpoint", async () => {
    global.fetch = vi.fn().mockImplementation(async () => {
      return {
        ok: false,
        status: 403,
        json: async () => ({
          error: {
            message: "(#10) Application does not have permission for this action",
            type: "OAuthException",
            code: 10,
          },
        }),
      } as Response;
    });

    await expect(client.getPostInsights("token", "12345")).rejects.toThrowError(ThreadsApiError);
  });
});
