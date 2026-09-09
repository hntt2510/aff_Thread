import { describe, it, expect, vi, beforeEach } from "vitest";
import { PostService } from "@/services/post.service";
import { AccountService } from "@/services/account.service";
import { threadsClient } from "@/lib/threads/client";
import { db } from "@/db";
import { threadsAccounts, posts, postMedia } from "@/db/schema";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
let isDbReachable = false;

if (databaseUrl) {
  try {
    const probe = postgres(databaseUrl, { max: 1, connect_timeout: 2 });
    await probe`SELECT 1`;
    await probe.end();
    isDbReachable = true;
  } catch {
    isDbReachable = false;
  }
}

describe.skipIf(!isDbReachable)("PostService Media Publishing & Lifecycle", () => {
  let postService: PostService;
  let accountService: AccountService;
  let account: any;

  beforeEach(async () => {
    postService = new PostService();
    accountService = new AccountService();
    vi.restoreAllMocks();

    await db.delete(postMedia);
    await db.delete(posts);
    await db.delete(threadsAccounts);

    vi.spyOn(threadsClient, "getProfile").mockResolvedValue({
      id: "threads_media_user",
      username: "media_tester",
      name: "Media Tester",
    });

    account = await accountService.addAccount("valid_media_token_123");
  });

  it("publishes an IMAGE post successfully", async () => {
    const imageSpy = vi
      .spyOn(threadsClient, "createImageContainer")
      .mockResolvedValue({ id: "image_container_1" });
    const publishSpy = vi
      .spyOn(threadsClient, "publishContainer")
      .mockResolvedValue({ id: "published_image_post_1" });

    const post = await postService.publishPost({
      accountId: account.id,
      text: "Beautiful photography",
      mediaType: "IMAGE",
      mediaItems: [
        {
          mediaKind: "IMAGE",
          sourceUrl: "https://images.unsplash.com/photo-1",
          altText: "A mountain view",
        },
      ],
    });

    expect(post.status).toBe("PUBLISHED");
    expect(post.mediaType).toBe("IMAGE");
    expect(post.threadsPostId).toBe("published_image_post_1");

    expect(imageSpy).toHaveBeenCalledWith(
      "valid_media_token_123",
      "https://images.unsplash.com/photo-1",
      "Beautiful photography",
      "A mountain view"
    );
    expect(publishSpy).toHaveBeenCalledWith("valid_media_token_123", "image_container_1");
  });

  it("publishes a VIDEO post when video container finishes processing", async () => {
    vi.spyOn(threadsClient, "createVideoContainer").mockResolvedValue({
      id: "video_container_1",
    });
    vi.spyOn(threadsClient, "waitForContainerReady").mockResolvedValue({
      ready: true,
      status: "FINISHED",
    });
    vi.spyOn(threadsClient, "publishContainer").mockResolvedValue({
      id: "published_video_post_1",
    });

    const post = await postService.publishPost({
      accountId: account.id,
      text: "Watch this video!",
      mediaType: "VIDEO",
      mediaItems: [
        {
          mediaKind: "VIDEO",
          sourceUrl: "https://example.com/video1.mp4",
        },
      ],
    });

    expect(post.status).toBe("PUBLISHED");
    expect(post.processingStatus).toBe("FINISHED");
    expect(post.threadsPostId).toBe("published_video_post_1");
  });

  it("reschedules a VIDEO post when container processing is still IN_PROGRESS", async () => {
    vi.spyOn(threadsClient, "createVideoContainer").mockResolvedValue({
      id: "video_container_pending",
    });
    vi.spyOn(threadsClient, "waitForContainerReady").mockResolvedValue({
      ready: false,
      status: "IN_PROGRESS",
    });

    const post = await postService.publishPost({
      accountId: account.id,
      text: "Long video rendering",
      mediaType: "VIDEO",
      mediaItems: [
        {
          mediaKind: "VIDEO",
          sourceUrl: "https://example.com/long_video.mp4",
        },
      ],
    });

    // Post must be safely deferred to SCHEDULED with processingStatus IN_PROGRESS
    expect(post.status).toBe("SCHEDULED");
    expect(post.processingStatus).toBe("IN_PROGRESS");
    expect(post.containerId).toBe("video_container_pending");
    expect(post.scheduledAt).toBeDefined();
  });

  it("publishes a multi-slide CAROUSEL post", async () => {
    let callIndex = 0;
    vi.spyOn(threadsClient, "createCarouselItemContainer").mockImplementation(async () => {
      callIndex++;
      return { id: `carousel_item_${callIndex}` };
    });

    const carouselSpy = vi
      .spyOn(threadsClient, "createCarouselContainer")
      .mockResolvedValue({ id: "carousel_parent_container_1" });

    const publishSpy = vi
      .spyOn(threadsClient, "publishContainer")
      .mockResolvedValue({ id: "published_carousel_post_1" });

    const post = await postService.publishPost({
      accountId: account.id,
      text: "Multi-slide tutorial",
      mediaType: "CAROUSEL",
      mediaItems: [
        { mediaKind: "IMAGE", sourceUrl: "https://example.com/slide1.jpg", altText: "Step 1" },
        { mediaKind: "IMAGE", sourceUrl: "https://example.com/slide2.jpg", altText: "Step 2" },
        { mediaKind: "IMAGE", sourceUrl: "https://example.com/slide3.jpg", altText: "Step 3" },
      ],
    });

    expect(post.status).toBe("PUBLISHED");
    expect(post.mediaType).toBe("CAROUSEL");
    expect(post.threadsPostId).toBe("published_carousel_post_1");

    expect(carouselSpy).toHaveBeenCalledWith(
      "valid_media_token_123",
      ["carousel_item_1", "carousel_item_2", "carousel_item_3"],
      "Multi-slide tutorial"
    );
    expect(publishSpy).toHaveBeenCalledWith(
      "valid_media_token_123",
      "carousel_parent_container_1"
    );
  });

  it("schedules a media post with attached media items", async () => {
    const futureDate = new Date(Date.now() + 2 * 60 * 60 * 1000);

    const post = await postService.schedulePost({
      accountId: account.id,
      text: "Future announcement",
      mediaType: "IMAGE",
      scheduledAt: futureDate,
      mediaItems: [
        {
          mediaKind: "IMAGE",
          sourceUrl: "https://example.com/banner.png",
          altText: "Promo banner",
        },
      ],
    });

    expect(post.status).toBe("SCHEDULED");
    expect(post.mediaType).toBe("IMAGE");

    const postList = await postService.listPosts();
    const scheduled = postList.find((p) => p.id === post.id);
    expect(scheduled).toBeDefined();
    expect(scheduled?.media).toHaveLength(1);
    expect(scheduled?.media?.[0].sourceUrl).toBe("https://example.com/banner.png");
  });
});
