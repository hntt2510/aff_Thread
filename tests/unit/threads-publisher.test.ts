import { describe, it, expect, beforeEach, vi } from "vitest";
import { threadsPublisherService } from "@/services/threads/threads-publisher.service";
import { monetizationService } from "@/services/monetization.service";
import { threadsClient, ThreadsApiError } from "@/lib/threads/client";
import { accountService } from "@/services/account.service";
import { db } from "@/db";
import {
  posts,
  threadsAccounts,
  monetizationPlans,
  affiliateReplies,
  affiliateReplyLinks,
  postMonetizationState,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import postgres from "postgres";

const databaseUrl = process.env.TEST_DATABASE_URL;
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

describe("Threads Publisher Service - Logic & Delay", () => {
  it("calculates delay within specified min and max bounds", () => {
    const min = 30000;
    const max = 60000;
    for (let i = 0; i < 20; i++) {
      const delay = threadsPublisherService.calculateDelay(min, max);
      expect(delay).toBeGreaterThanOrEqual(min);
      expect(delay).toBeLessThanOrEqual(max);
      expect(Number.isInteger(delay)).toBe(true);
    }
  });

  it("handles minDelay >= maxDelay gracefully", () => {
    const delay = threadsPublisherService.calculateDelay(5000, 5000);
    expect(delay).toBe(5000);

    const reversedDelay = threadsPublisherService.calculateDelay(8000, 4000);
    expect(reversedDelay).toBe(8000);
  });

  it("validates input in publishDirectly", async () => {
    await expect(
      threadsPublisherService.publishDirectly({
        accountId: "",
        mainPostText: "Valid text",
      })
    ).rejects.toThrow("Missing required accountId");

    await expect(
      threadsPublisherService.publishDirectly({
        accountId: "acc_1",
        mainPostText: "",
      })
    ).rejects.toThrow("Main post text cannot be empty");

    const longText = "a".repeat(501);
    await expect(
      threadsPublisherService.publishDirectly({
        accountId: "acc_1",
        mainPostText: longText,
      })
    ).rejects.toThrow("Main post exceeds Threads 500 characters limit");
  });
});

describe.skipIf(!isDbReachable)("Threads Publisher Service - DB Integration", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();

    await db.delete(affiliateReplyLinks);
    await db.delete(affiliateReplies);
    await db.delete(monetizationPlans);
    await db.delete(postMonetizationState);
    await db.delete(posts);
    await db.delete(threadsAccounts);
  });

  it("executes full sequential publishing pipeline (Main Post -> Delay -> First Reply)", async () => {
    const [account] = await db
      .insert(threadsAccounts)
      .values({
        threadsUserId: "u_meta_123",
        username: "story_teller",
        displayName: "Story Teller",
        encryptedAccessToken: "enc_token_123",
        tokenIv: "iv_123",
        tokenAuthTag: "tag_123",
        status: "ACTIVE",
      })
      .returning();

    const [post] = await db
      .insert(posts)
      .values({
        accountId: account.id,
        accountThreadsUserId: account.threadsUserId,
        accountUsername: account.username,
        accountDisplayName: account.displayName,
        text: "Hối hận vì không biết đến mẹo này sớm hơn cả năm trời...",
        mediaType: "TEXT",
        status: "DRAFT",
      })
      .returning();

    // Create plan with reply
    const planResult = await monetizationService.createPlan({
      postId: post.id,
      replies: [
        {
          replyText: "Món đồ tui nhắc tới ở đây nè mng: https://s.shopee.vn/sample123",
        },
      ],
    });

    vi.spyOn(accountService, "getDecryptedTokenForAccount").mockResolvedValue({
      token: "valid_decrypted_token_xyz",
      account: account as any,
    });

    const createTextContainerSpy = vi
      .spyOn(threadsClient, "createTextContainer")
      .mockResolvedValue({ id: "main_container_999" });

    const createReplyContainerSpy = vi
      .spyOn(threadsClient, "createReplyContainer")
      .mockResolvedValue({ id: "reply_container_888" });

    const publishContainerSpy = vi
      .spyOn(threadsClient, "publishContainer")
      .mockImplementation(async (_token, containerId) => {
        if (containerId === "main_container_999") {
          return { id: "published_thread_post_777" };
        }
        return { id: "published_reply_comment_666" };
      });

    const result = await threadsPublisherService.publishPostWithReply(post.id, {
      skipDelay: true,
    });

    expect(result.success).toBe(true);
    expect(result.postId).toBe(post.id);
    expect(result.threadsPostId).toBe("published_thread_post_777");
    expect(result.replyId).toBe("published_reply_comment_666");
    expect(result.threadUrl).toBe("https://www.threads.net/@story_teller/post/published_thread_post_777");

    // Verify main post container was created with correct params
    expect(createTextContainerSpy).toHaveBeenCalledWith(
      "valid_decrypted_token_xyz",
      post.text,
      "u_meta_123"
    );

    // Verify reply container was created targeting the main post ID
    expect(createReplyContainerSpy).toHaveBeenCalledWith(
      "valid_decrypted_token_xyz",
      "published_thread_post_777",
      "Món đồ tui nhắc tới ở đây nè mng: https://s.shopee.vn/sample123",
      "TEXT",
      undefined,
      "u_meta_123"
    );

    expect(publishContainerSpy).toHaveBeenCalledTimes(2);

    // Verify DB post record
    const [updatedPost] = await db.select().from(posts).where(eq(posts.id, post.id));
    expect(updatedPost.status).toBe("PUBLISHED");
    expect(updatedPost.threadsPostId).toBe("published_thread_post_777");
    expect(updatedPost.publishedAt).toBeDefined();

    // Verify DB reply record
    const [updatedReply] = await db
      .select()
      .from(affiliateReplies)
      .where(eq(affiliateReplies.id, planResult.replies[0].id));
    expect(updatedReply.status).toBe("PUBLISHED");
    expect(updatedReply.threadsReplyId).toBe("published_reply_comment_666");
    expect(updatedReply.threadsContainerId).toBe("reply_container_888");

    // Verify monetization plan marked COMPLETED
    const [updatedPlan] = await db
      .select()
      .from(monetizationPlans)
      .where(eq(monetizationPlans.id, planResult.plan.id));
    expect(updatedPlan.status).toBe("COMPLETED");
  });

  it("handles INVALID_TOKEN error by marking account and post as failed", async () => {
    const [account] = await db
      .insert(threadsAccounts)
      .values({
        threadsUserId: "u_meta_expired",
        username: "expired_account",
        displayName: "Expired Account",
        encryptedAccessToken: "enc_expired",
        tokenIv: "iv_exp",
        tokenAuthTag: "tag_exp",
        status: "ACTIVE",
      })
      .returning();

    const [post] = await db
      .insert(posts)
      .values({
        accountId: account.id,
        accountThreadsUserId: account.threadsUserId,
        accountUsername: account.username,
        accountDisplayName: account.displayName,
        text: "Testing token expiration handling",
        mediaType: "TEXT",
        status: "DRAFT",
      })
      .returning();

    vi.spyOn(accountService, "getDecryptedTokenForAccount").mockResolvedValue({
      token: "expired_token_abc",
      account: account as any,
    });

    vi.spyOn(threadsClient, "createTextContainer").mockRejectedValue(
      new ThreadsApiError("INVALID_TOKEN", "Session has expired or token is invalid", 401)
    );

    await expect(
      threadsPublisherService.publishPostWithReply(post.id, { skipDelay: true })
    ).rejects.toThrow("Session has expired or token is invalid");

    // Verify account status updated to INVALID_TOKEN
    const [updatedAccount] = await db
      .select()
      .from(threadsAccounts)
      .where(eq(threadsAccounts.id, account.id));
    expect(updatedAccount.status).toBe("INVALID_TOKEN");

    // Verify post marked FAILED with errorCode
    const [updatedPost] = await db.select().from(posts).where(eq(posts.id, post.id));
    expect(updatedPost.status).toBe("FAILED");
    expect(updatedPost.errorCode).toBe("INVALID_TOKEN");
  });

  it("supports direct publish from composer (publishDirectly)", async () => {
    const [account] = await db
      .insert(threadsAccounts)
      .values({
        threadsUserId: "u_meta_direct",
        username: "direct_author",
        displayName: "Direct Author",
        encryptedAccessToken: "enc_direct",
        tokenIv: "iv_dir",
        tokenAuthTag: "tag_dir",
        status: "ACTIVE",
      })
      .returning();

    vi.spyOn(accountService, "getDecryptedTokenForAccount").mockResolvedValue({
      token: "valid_direct_token",
      account: account as any,
    });

    vi.spyOn(threadsClient, "createTextContainer").mockResolvedValue({
      id: "c_direct_main",
    });

    vi.spyOn(threadsClient, "createReplyContainer").mockResolvedValue({
      id: "c_direct_reply",
    });

    vi.spyOn(threadsClient, "publishContainer").mockImplementation(
      async (_token, containerId) => {
        if (containerId === "c_direct_main") {
          return { id: "p_direct_post_100" };
        }
        return { id: "p_direct_reply_200" };
      }
    );

    const result = await threadsPublisherService.publishDirectly({
      accountId: account.id,
      mainPostText: "Direct story post content",
      firstReplyText: "Direct affiliate link: https://s.shopee.vn/sample",
      directAffiliateUrl: "https://s.shopee.vn/sample",
      skipDelay: true,
    });

    expect(result.success).toBe(true);
    expect(result.threadsPostId).toBe("p_direct_post_100");
    expect(result.replyId).toBe("p_direct_reply_200");
    expect(result.threadUrl).toBe("https://www.threads.net/@direct_author/post/p_direct_post_100");

    // Check post created in DB
    const [createdPost] = await db
      .select()
      .from(posts)
      .where(eq(posts.threadsPostId, "p_direct_post_100"));
    expect(createdPost).toBeDefined();
    expect(createdPost.status).toBe("PUBLISHED");
  });

  it("schedules a post for future publishing (schedulePost)", async () => {
    const [account] = await db
      .insert(threadsAccounts)
      .values({
        threadsUserId: "u_meta_sched",
        username: "sched_author",
        displayName: "Scheduled Author",
        encryptedAccessToken: "enc_sched",
        tokenIv: "iv_sched",
        tokenAuthTag: "tag_sched",
        status: "ACTIVE",
      })
      .returning();

    const [post] = await db
      .insert(posts)
      .values({
        accountId: account.id,
        accountThreadsUserId: account.threadsUserId,
        accountUsername: account.username,
        accountDisplayName: account.displayName,
        text: "Scheduled story post content",
        mediaType: "TEXT",
        status: "DRAFT",
      })
      .returning();

    const futureDate = new Date(Date.now() + 3600000); // 1 hour later
    const scheduled = await threadsPublisherService.schedulePost(post.id, futureDate);

    expect(scheduled.status).toBe("SCHEDULED");
    expect(scheduled.scheduledPublishAt).toEqual(futureDate);

    const [dbPost] = await db.select().from(posts).where(eq(posts.id, post.id));
    expect(dbPost.status).toBe("SCHEDULED");
  });
});
