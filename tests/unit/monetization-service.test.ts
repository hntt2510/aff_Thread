import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import {
  monetizationService,
  sanitizeNumericField,
  sanitizeTimestampField,
  sanitizeIntegerFieldWithDefault,
} from "@/services/monetization.service";
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

describe("Monetization Field Sanitizers", () => {
  describe("sanitizeNumericField", () => {
    it("converts empty strings, whitespace, null, and undefined to null", () => {
      expect(sanitizeNumericField("")).toBeNull();
      expect(sanitizeNumericField("   ")).toBeNull();
      expect(sanitizeNumericField(null)).toBeNull();
      expect(sanitizeNumericField(undefined)).toBeNull();
      expect(sanitizeNumericField("null")).toBeNull();
      expect(sanitizeNumericField("undefined")).toBeNull();
    });

    it("converts NaN and non-numeric strings to null", () => {
      expect(sanitizeNumericField(NaN)).toBeNull();
      expect(sanitizeNumericField("NaN")).toBeNull();
      expect(sanitizeNumericField("abc")).toBeNull();
      expect(sanitizeNumericField({})).toBeNull();
    });

    it("preserves valid numbers and casts numeric strings", () => {
      expect(sanitizeNumericField(0)).toBe(0);
      expect(sanitizeNumericField("0")).toBe(0);
      expect(sanitizeNumericField(75)).toBe(75);
      expect(sanitizeNumericField("75")).toBe(75);
      expect(sanitizeNumericField("  75  ")).toBe(75);
      expect(sanitizeNumericField(75.4)).toBe(75);
      expect(sanitizeNumericField("75.6")).toBe(76);
    });
  });

  describe("sanitizeTimestampField", () => {
    it("converts empty strings, whitespace, null, and undefined to null", () => {
      expect(sanitizeTimestampField("")).toBeNull();
      expect(sanitizeTimestampField("   ")).toBeNull();
      expect(sanitizeTimestampField(null)).toBeNull();
      expect(sanitizeTimestampField(undefined)).toBeNull();
      expect(sanitizeTimestampField("null")).toBeNull();
      expect(sanitizeTimestampField("undefined")).toBeNull();
    });

    it("converts invalid date strings and invalid Date instances to null", () => {
      expect(sanitizeTimestampField("invalid-date-string")).toBeNull();
      expect(sanitizeTimestampField(new Date("invalid"))).toBeNull();
      expect(sanitizeTimestampField({})).toBeNull();
    });

    it("preserves valid Date instances and parses ISO date strings", () => {
      const now = new Date();
      const resultDate = sanitizeTimestampField(now);
      expect(resultDate).toBeInstanceOf(Date);
      expect(resultDate?.getTime()).toBe(now.getTime());

      const iso = "2026-09-19T21:00:00.000Z";
      const parsedIso = sanitizeTimestampField(iso);
      expect(parsedIso).toBeInstanceOf(Date);
      expect(parsedIso?.toISOString()).toBe(iso);

      const epoch = 1726780000000;
      const parsedEpoch = sanitizeTimestampField(epoch);
      expect(parsedEpoch).toBeInstanceOf(Date);
      expect(parsedEpoch?.getTime()).toBe(epoch);
    });
  });

  describe("sanitizeIntegerFieldWithDefault", () => {
    it("falls back to default when input is empty string or null", () => {
      expect(sanitizeIntegerFieldWithDefault("", 300)).toBe(300);
      expect(sanitizeIntegerFieldWithDefault("   ", 300)).toBe(300);
      expect(sanitizeIntegerFieldWithDefault(null, 2)).toBe(2);
      expect(sanitizeIntegerFieldWithDefault(undefined, 12)).toBe(12);
      expect(sanitizeIntegerFieldWithDefault("abc", 10)).toBe(10);
    });

    it("uses provided valid value over default", () => {
      expect(sanitizeIntegerFieldWithDefault(500, 300)).toBe(500);
      expect(sanitizeIntegerFieldWithDefault("500", 300)).toBe(500);
      expect(sanitizeIntegerFieldWithDefault(0, 300)).toBe(0);
      expect(sanitizeIntegerFieldWithDefault("0", 300)).toBe(0);
    });
  });
});

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

  it("safely handles empty strings for scoreAtCreation, scheduledAt, and numeric fields without PostgreSQL type errors", async () => {
    const [account] = await db
      .insert(threadsAccounts)
      .values({
        threadsUserId: "user_monetize_empty_str",
        username: "monetize_user_empty",
        displayName: "Monetize User Empty",
        encryptedAccessToken: "enc_empty",
        tokenIv: "iv_empty",
        tokenAuthTag: "tag_empty",
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
        text: "Post for empty string sanitizer test",
        threadsPostId: "tp_parent_empty_str",
        status: "PUBLISHED",
      })
      .returning();

    // Call createPlan with empty strings (as received from HTTP JSON payloads)
    const created = await monetizationService.createPlan({
      postId: post.id,
      source: "SHOPEE_DEAL_ENGINE",
      scoreAtCreation: "" as any,
      scheduledAt: "" as any,
      targetViews: "" as any,
      targetReplies: "" as any,
      maxWaitHours: "" as any,
      replies: [
        {
          replyText: "Con đầm này nè: https://s.shopee.vn/sampleSanitize",
          scheduledAt: "" as any,
          sequenceNo: "" as any,
          links: [
            {
              destinationUrl: "https://s.shopee.vn/sampleSanitize",
              position: "" as any,
            },
          ],
        },
      ],
    });

    expect(created.plan).toBeDefined();
    expect(created.plan.scoreAtCreation).toBeNull();
    expect(created.plan.scheduledAt).toBeNull();
    expect(created.plan.targetViews).toBe(300);
    expect(created.plan.targetReplies).toBe(2);
    expect(created.plan.maxWaitHours).toBe(12);
    expect(created.plan.source).toBe("SHOPEE_DEAL_ENGINE");

    // Verify raw PostgreSQL values in monetization_plans table
    const [dbPlan] = await db
      .select()
      .from(monetizationPlans)
      .where(eq(monetizationPlans.id, created.plan.id));

    expect(dbPlan.scoreAtCreation).toBeNull();
    expect(dbPlan.scheduledAt).toBeNull();
    expect(dbPlan.targetViews).toBe(300);
    expect(dbPlan.targetReplies).toBe(2);
    expect(dbPlan.maxWaitHours).toBe(12);

    // Verify raw PostgreSQL values in affiliate_replies table
    const [dbReply] = await db
      .select()
      .from(affiliateReplies)
      .where(eq(affiliateReplies.monetizationPlanId, created.plan.id));

    expect(dbReply.scheduledAt).toBeNull();
    expect(dbReply.sequenceNo).toBe(1);
    expect(dbReply.targetViews).toBe(300);
    expect(dbReply.targetReplies).toBe(2);
    expect(dbReply.maxWaitHours).toBe(12);

    // Verify raw PostgreSQL values in affiliate_reply_links table
    const [dbLink] = await db
      .select()
      .from(affiliateReplyLinks)
      .where(eq(affiliateReplyLinks.affiliateReplyId, dbReply.id));

    expect(dbLink.position).toBe(0);
  });

  afterAll(async () => {
    try {
      await db.delete(affiliateReplyLinks);
      await db.delete(affiliateReplies);
      await db.delete(monetizationPlans);
      await db.delete(postMonetizationState);
      await db.delete(posts);
      await db.delete(threadsAccounts);
    } catch {
      // ignore
    }
  });
});
