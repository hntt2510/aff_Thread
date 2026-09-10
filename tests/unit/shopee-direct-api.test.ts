import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ShopeeDirectApiClient } from "@/services/shopee/shopee-direct-api.client";

describe("ShopeeDirectApiClient", () => {
  let client: ShopeeDirectApiClient;
  const originalFetch = global.fetch;

  beforeEach(() => {
    client = new ShopeeDirectApiClient({ endpoint: "https://mock.shopee.vn/api/v3/gql" });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("generates direct affiliate shortlink successfully", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      status: 200,
      text: async () =>
        JSON.stringify({
          data: {
            batchCustomLink: [
              {
                shortLink: "https://s.shopee.vn/test12345",
                longLink: "https://shopee.vn/product/123/456",
                failCode: 0,
              },
            ],
          },
        }),
    } as any);

    const res = await client.generateCustomLink(
      "https://shopee.vn/product/123/456",
      "SPC_EC=token1; SPC_ST=token2"
    );

    expect(res.success).toBe(true);
    expect(res.shortLink).toBe("https://s.shopee.vn/test12345");
    expect(res.failCode).toBe(0);
  });

  it("identifies expired auth on HTTP 401 / 403", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      status: 401,
      text: async () => "Unauthorized",
    } as any);

    const res = await client.generateCustomLink(
      "https://shopee.vn/product/123/456",
      "SPC_EC=expired_token;"
    );

    expect(res.success).toBe(false);
    expect(res.errorCategory).toBe("AUTH_EXPIRED");
  });

  it("identifies anti-bot challenge response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      status: 200,
      text: async () => "<html><title>Security Verification - Challenge</title></html>",
    } as any);

    const res = await client.generateCustomLink(
      "https://shopee.vn/product/123/456",
      "SPC_EC=token1;"
    );

    expect(res.success).toBe(false);
    expect(res.errorCategory).toBe("CHALLENGE_REQUIRED");
  });

  it("identifies auth expiration from GraphQL failCode 10002", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      status: 200,
      text: async () =>
        JSON.stringify({
          data: {
            batchCustomLink: [
              {
                shortLink: null,
                failCode: 10002,
              },
            ],
          },
        }),
    } as any);

    const res = await client.generateCustomLink(
      "https://shopee.vn/product/123/456",
      "SPC_EC=token1;"
    );

    expect(res.success).toBe(false);
    expect(res.errorCategory).toBe("AUTH_EXPIRED");
  });

  it("validates session as ACTIVE when link generation succeeds", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      status: 200,
      text: async () =>
        JSON.stringify({
          data: {
            batchCustomLink: [
              {
                shortLink: "https://s.shopee.vn/valid",
                failCode: 0,
              },
            ],
          },
        }),
    } as any);

    const res = await client.validateSession("SPC_EC=valid_token; SPC_ST=token;");
    expect(res.isValid).toBe(true);
    expect(res.status).toBe("ACTIVE");
  });
});
