import { describe, it, expect, vi, beforeEach } from "vitest";
import { ThreadsClient, ThreadsApiError } from "@/lib/threads/client";

describe("Threads Client Media Methods", () => {
  let client: ThreadsClient;
  const token = "mock_threads_bearer_token";

  beforeEach(() => {
    client = new ThreadsClient();
    vi.restoreAllMocks();
  });

  it("creates an image container with Authorization Bearer header", async () => {
    let capturedUrl = "";
    let capturedHeaders: Record<string, string> = {};
    let capturedBody = "";

    global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedHeaders = (init?.headers as Record<string, string>) || {};
      capturedBody = (init?.body as string) || "";
      return {
        ok: true,
        json: async () => ({ id: "img_container_123" }),
      } as Response;
    });

    const res = await client.createImageContainer(
      token,
      "https://example.com/pic.jpg",
      "Check this out!",
      "An image description"
    );

    expect(res.id).toBe("img_container_123");
    expect(capturedUrl).toBe("https://graph.threads.net/v1.0/me/threads");
    expect(capturedHeaders.Authorization).toBe(`Bearer ${token}`);
    expect(capturedUrl).not.toContain(token);

    const params = new URLSearchParams(capturedBody);
    expect(params.get("media_type")).toBe("IMAGE");
    expect(params.get("image_url")).toBe("https://example.com/pic.jpg");
    expect(params.get("text")).toBe("Check this out!");
    expect(params.get("alt_text")).toBe("An image description");
  });

  it("creates a video container with Authorization Bearer header", async () => {
    let capturedBody = "";

    global.fetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      capturedBody = (init?.body as string) || "";
      return {
        ok: true,
        json: async () => ({ id: "vid_container_456" }),
      } as Response;
    });

    const res = await client.createVideoContainer(
      token,
      "https://example.com/video.mp4",
      "Watch video"
    );

    expect(res.id).toBe("vid_container_456");
    const params = new URLSearchParams(capturedBody);
    expect(params.get("media_type")).toBe("VIDEO");
    expect(params.get("video_url")).toBe("https://example.com/video.mp4");
    expect(params.get("text")).toBe("Watch video");
  });

  it("creates a carousel item container with is_carousel_item=true", async () => {
    let capturedBody = "";

    global.fetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      capturedBody = (init?.body as string) || "";
      return {
        ok: true,
        json: async () => ({ id: "item_container_789" }),
      } as Response;
    });

    const res = await client.createCarouselItemContainer(
      token,
      "IMAGE",
      "https://example.com/slide1.jpg",
      "Slide 1 Alt"
    );

    expect(res.id).toBe("item_container_789");
    const params = new URLSearchParams(capturedBody);
    expect(params.get("media_type")).toBe("IMAGE");
    expect(params.get("image_url")).toBe("https://example.com/slide1.jpg");
    expect(params.get("is_carousel_item")).toBe("true");
    expect(params.get("alt_text")).toBe("Slide 1 Alt");
  });

  it("creates a carousel parent container with children IDs", async () => {
    let capturedBody = "";

    global.fetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      capturedBody = (init?.body as string) || "";
      return {
        ok: true,
        json: async () => ({ id: "carousel_parent_101" }),
      } as Response;
    });

    const res = await client.createCarouselContainer(
      token,
      ["child_1", "child_2", "child_3"],
      "Carousel post caption"
    );

    expect(res.id).toBe("carousel_parent_101");
    const params = new URLSearchParams(capturedBody);
    expect(params.get("media_type")).toBe("CAROUSEL");
    expect(params.get("children")).toBe("child_1,child_2,child_3");
    expect(params.get("text")).toBe("Carousel post caption");
  });

  it("checks container status correctly", async () => {
    let capturedUrl = "";

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      capturedUrl = url;
      return {
        ok: true,
        json: async () => ({
          id: "container_status_test",
          status: "FINISHED",
        }),
      } as Response;
    });

    const res = await client.getContainerStatus(token, "container_status_test");
    expect(res.status).toBe("FINISHED");
    expect(capturedUrl).toContain("/container_status_test?fields=id%2Cstatus%2Cerror_message");
  });

  it("handles waitForContainerReady when ready immediately", async () => {
    global.fetch = vi.fn().mockImplementation(async () => ({
      ok: true,
      json: async () => ({ id: "c1", status: "FINISHED" }),
    }) as Response);

    const result = await client.waitForContainerReady(token, "c1", 5000, 100);
    expect(result.ready).toBe(true);
    expect(result.status).toBe("FINISHED");
  });

  it("handles waitForContainerReady when timeout expires while IN_PROGRESS", async () => {
    global.fetch = vi.fn().mockImplementation(async () => ({
      ok: true,
      json: async () => ({ id: "c2", status: "IN_PROGRESS" }),
    }) as Response);

    const result = await client.waitForContainerReady(token, "c2", 200, 50);
    expect(result.ready).toBe(false);
    expect(result.status).toBe("IN_PROGRESS");
  });

  it("throws ThreadsApiError when container processing fails with ERROR", async () => {
    global.fetch = vi.fn().mockImplementation(async () => ({
      ok: true,
      json: async () => ({
        id: "c3",
        status: "ERROR",
        error_message: "Video codec unsupported",
      }),
    }) as Response);

    await expect(client.waitForContainerReady(token, "c3", 5000, 100)).rejects.toThrow(
      ThreadsApiError
    );
  });
});
