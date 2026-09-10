import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET as getSessionRoute, POST as postSessionRoute, DELETE as deleteSessionRoute } from "@/app/api/shopee/session/route";
import { POST as testSessionRoute } from "@/app/api/shopee/session/test/route";
import { POST as generateLinkRoute } from "@/app/api/shopee/generate-link/route";
import { shopeeDirectApiClient } from "@/services/shopee/shopee-direct-api.client";

describe("Shopee Session API Integration", () => {
  beforeEach(async () => {
    // Clean up session before each test
    await deleteSessionRoute();
  });

  it("GET /api/shopee/session returns NO_SESSION initially", async () => {
    const res = await getSessionRoute();
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.session.isConfigured).toBe(false);
    expect(data.session.status).toBe("NO_SESSION");
  });

  it("POST /api/shopee/session rejects empty payload", async () => {
    const req = new NextRequest("http://localhost:3000/api/shopee/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cookiePayload: "" }),
    });

    const res = await postSessionRoute(req);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.success).toBe(false);
  });

  it("POST /api/shopee/session saves and validates valid cookies", async () => {
    // Mock successful validation
    vi.spyOn(shopeeDirectApiClient, "validateSession").mockResolvedValue({
      isValid: true,
      status: "ACTIVE",
    });

    const cookieJson = JSON.stringify([
      { name: "SPC_EC", value: "valid_secret_ec_token" },
      { name: "SPC_ST", value: "valid_session_st_token" },
      { name: "SPC_U", value: "affiliate_user_99" },
    ]);

    const req = new NextRequest("http://localhost:3000/api/shopee/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cookiePayload: cookieJson }),
    });

    const res = await postSessionRoute(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.status).toBe("ACTIVE");

    // Check that GET returns active session with sanitized data
    const getRes = await getSessionRoute();
    const getData = await getRes.json();
    expect(getData.session.isConfigured).toBe(true);
    expect(getData.session.status).toBe("ACTIVE");
    expect(getData.session.username).toBe("affiliate_user_99");
  });

  it("POST /api/shopee/generate-link generates shortlink using active session", async () => {
    vi.spyOn(shopeeDirectApiClient, "validateSession").mockResolvedValue({
      isValid: true,
      status: "ACTIVE",
    });
    vi.spyOn(shopeeDirectApiClient, "generateCustomLink").mockResolvedValue({
      success: true,
      shortLink: "https://s.shopee.vn/integrated_shortlink",
      failCode: 0,
    });

    // Save session first
    const saveReq = new NextRequest("http://localhost:3000/api/shopee/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cookiePayload: "SPC_EC=valid_ec; SPC_ST=valid_st; SPC_U=user;",
      }),
    });
    await postSessionRoute(saveReq);

    // Call generate-link
    const linkReq = new NextRequest("http://localhost:3000/api/shopee/generate-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        originalUrl: "https://shopee.vn/product/123/456",
        subIds: ["campaign_threads_1"],
      }),
    });

    const linkRes = await generateLinkRoute(linkReq);
    expect(linkRes.status).toBe(200);

    const linkData = await linkRes.json();
    expect(linkData.success).toBe(true);
    expect(linkData.shortLink).toBe("https://s.shopee.vn/integrated_shortlink");
  });

  it("DELETE /api/shopee/session disconnects session", async () => {
    const delRes = await deleteSessionRoute();
    expect(delRes.status).toBe(200);

    const getRes = await getSessionRoute();
    const getData = await getRes.json();
    expect(getData.session.isConfigured).toBe(false);
    expect(getData.session.status).toBe("NO_SESSION");
  });
});
