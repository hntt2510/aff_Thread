import { describe, it, expect, beforeEach, vi } from "vitest";
import { monetizationService } from "@/services/monetization.service";
import { db } from "@/db";
import {
  posts,
  threadsAccounts,
  postMonetizationState,
  monetizationPlans,
  affiliateReplies,
  affiliateReplyLinks,
  postInsightSnapshots,
} from "@/db/schema";
import { eq } from "drizzle-orm";
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

describe.skipIf(!isDbReachable)("Monetization Service", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();

    await db.delete(affiliateReplyLinks);
    await db.delete(affiliateReplies);
    await db.delete(monetizationPlans);
    await db.delete(postMonetizationState);
    await db.delete(postInsightSnapshots);
    await db.delete(posts);
    await db.delete(threadsAccounts);
  });

  it("creates a monetization plan with multi-reply, multi-link and deterministic idempotency keys", async () => {
    const [account] = await db
      .insert(threadsAccounts)
      .values({
        threadsUserId: "user_monetize_1",
        username: "monetize_user",
        displayName: "Monetize User",
        encryptedAccessToken: "enc_1",
        tokenIv: "iv_1",
        tokenAuthTag: "tag_1",
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
        text: "Top recommendations for home decor",
        threadsPostId: "tp_parent_9999",
        status: "PUBLISHED",
      })
      .returning();

    // Set initial state to ELIGIBLE
    await db.insert(postMonetizationState).values({
      postId: post.id,
      status: "ELIGIBLE",
      currentScore: 75,
      scoreVersion: "v1",
      scoreExplanation: "Score: 75 => ELIGIBLE",
    });

    const created = await monetizationService.createPlan({
      postId: post.id,
      source: "MANUAL",
      replies: [
        {
          replyText: "Deal xịn ở đây nha cả nhà 👇",
          links: [
            { destinationUrl: "https://s.shopee.vn/productA", label: "Mẫu A" },
            { destinationUrl: "https://s.shopee.vn/productB", label: "Mẫu B" },
          ],
        },
        {
          replyText: "Ai thích bản cao cấp hơn thì xem cái này nhé:",
          links: [
            { destinationUrl: "https://s.shopee.vn/productC", label: "Mẫu C cao cấp" },
          ],
        },
      ],
    });

    expect(created.plan).toBeDefined();
    expect(created.plan.postId).toBe(post.id);
    expect(created.plan.status).toBe("READY");
    expect(created.replies.length).toBe(2);

    // Reply #1 assertions
    const reply1 = created.replies[0];
    expect(reply1.sequenceNo).toBe(1);
    expect(reply1.idempotencyKey).toBe(`plan_${created.plan.id}_seq_1`);
    expect(reply1.links.length).toBe(2);
    expect(reply1.replyText).toContain("https://s.shopee.vn/productA");
    expect(reply1.replyText).toContain("https://s.shopee.vn/productB");
    expect(reply1.replyText).not.toContain("/r/"); // Direct Shopee URL preserved!

    // Reply #2 assertions
    const reply2 = created.replies[1];
    expect(reply2.sequenceNo).toBe(2);
    expect(reply2.idempotencyKey).toBe(`plan_${created.plan.id}_seq_2`);
    expect(reply2.links.length).toBe(1);
    expect(reply2.replyText).toContain("https://s.shopee.vn/productC");

    // Post monetization state transitioned to PLANNED
    const postState = await monetizationService.getMonetizationState(post.id);
    expect(postState?.status).toBe("PLANNED");
  });

  it("validates URL schemes and rejects non-http links", async () => {
    const [account] = await db
      .insert(threadsAccounts)
      .values({
        threadsUserId: "user_monetize_2",
        username: "monetize_user_2",
        displayName: "Monetize User 2",
        encryptedAccessToken: "enc_2",
        tokenIv: "iv_2",
        tokenAuthTag: "tag_2",
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
        text: "Post for invalid url test",
        threadsPostId: "tp_parent_8888",
        status: "PUBLISHED",
      })
      .returning();

    await expect(
      monetizationService.createPlan({
        postId: post.id,
        replies: [
          {
            replyText: "Dangerous link",
            links: [{ destinationUrl: "javascript:alert(1)" }],
          },
        ],
      })
    ).rejects.toThrow("must begin with http:// or https://");
  });

  it("evaluates post monetization state transition from WATCHING to ELIGIBLE", async () => {
    const [account] = await db
      .insert(threadsAccounts)
      .values({
        threadsUserId: "user_monetize_3",
        username: "monetize_user_3",
        displayName: "Monetize User 3",
        encryptedAccessToken: "enc_3",
        tokenIv: "iv_3",
        tokenAuthTag: "tag_3",
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
        text: "High viral post",
        threadsPostId: "tp_parent_7777",
        status: "PUBLISHED",
      })
      .returning();

    // Insert high metric snapshot
    await db.insert(postInsightSnapshots).values({
      postId: post.id,
      threadsPostId: "tp_parent_7777",
      views: 2000,
      likes: 80,
      replies: 20,
      reposts: 5,
      quotes: 2,
    });

    const evaluated = await monetizationService.evaluatePost(post.id);
    expect(evaluated.status).toBe("ELIGIBLE");
    expect(evaluated.currentScore).toBeGreaterThanOrEqual(50);
    expect(evaluated.firstEligibleAt).toBeDefined();
  });

  it("cancels a plan and marks unpublished replies as CANCELLED", async () => {
    const [account] = await db
      .insert(threadsAccounts)
      .values({
        threadsUserId: "user_monetize_4",
        username: "monetize_user_4",
        displayName: "Monetize User 4",
        encryptedAccessToken: "enc_4",
        tokenIv: "iv_4",
        tokenAuthTag: "tag_4",
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
        text: "Post to cancel",
        threadsPostId: "tp_parent_6666",
        status: "PUBLISHED",
      })
      .returning();

    const created = await monetizationService.createPlan({
      postId: post.id,
      replies: [
        {
          replyText: "Reply to cancel",
          links: [{ destinationUrl: "https://s.shopee.vn/cancelMe" }],
        },
      ],
    });

    const cancelledPlan = await monetizationService.cancelPlan(created.plan.id);
    expect(cancelledPlan.status).toBe("CANCELLED");

    const [reply] = await db
      .select()
      .from(affiliateReplies)
      .where(eq(affiliateReplies.monetizationPlanId, created.plan.id));

    expect(reply.status).toBe("CANCELLED");
  });
});
