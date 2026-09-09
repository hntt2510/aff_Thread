import { describe, it, expect, beforeEach, vi } from "vitest";
import { replyPublisherService } from "@/services/reply-publisher.service";
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

describe.skipIf(!isDbReachable)("Reply Publisher Service", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();

    await db.delete(affiliateReplyLinks);
    await db.delete(affiliateReplies);
    await db.delete(monetizationPlans);
    await db.delete(postMonetizationState);
    await db.delete(posts);
    await db.delete(threadsAccounts);
  });

  it("claims due replies atomically using FOR UPDATE SKIP LOCKED", async () => {
    const [account] = await db
      .insert(threadsAccounts)
      .values({
        threadsUserId: "u_pub_1",
        username: "pub_user_1",
        displayName: "Pub User 1",
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
        text: "Parent post 1",
        threadsPostId: "tp_parent_claim_1",
        status: "PUBLISHED",
      })
      .returning();

    const created = await monetizationService.createPlan({
      postId: post.id,
      replies: [
        { replyText: "Reply 1 https://s.shopee.vn/item1" },
        { replyText: "Reply 2 https://s.shopee.vn/item2" },
      ],
    });

    const claimed = await replyPublisherService.claimDueReplies(10);
    expect(claimed.length).toBe(2);

    // Verify claimed in DB
    const [dbReply] = await db
      .select()
      .from(affiliateReplies)
      .where(eq(affiliateReplies.id, created.replies[0].id));

    expect(dbReply.status).toBe("CLAIMED");
  });

  it("enforces sequence ordering by deferring Reply #2 while Reply #1 is in progress", async () => {
    const [account] = await db
      .insert(threadsAccounts)
      .values({
        threadsUserId: "u_pub_2",
        username: "pub_user_2",
        displayName: "Pub User 2",
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
        text: "Parent post 2",
        threadsPostId: "tp_parent_seq_1",
        status: "PUBLISHED",
      })
      .returning();

    const created = await monetizationService.createPlan({
      postId: post.id,
      replies: [
        { replyText: "Reply 1 https://s.shopee.vn/seq1" },
        { replyText: "Reply 2 https://s.shopee.vn/seq2" },
      ],
    });

    // Attempting to process Reply #2 while Reply #1 is still READY
    const res = await replyPublisherService.processClaimedReply(created.replies[1]);
    expect(res.status).toBe("DEFERRED");
    expect(res.reason).toContain("Previous reply in sequence is not yet published");
  });

  it("successfully publishes reply and records Threads Reply ID", async () => {
    const [account] = await db
      .insert(threadsAccounts)
      .values({
        threadsUserId: "u_pub_3",
        username: "pub_user_3",
        displayName: "Pub User 3",
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
        text: "Parent post 3",
        threadsPostId: "tp_parent_success_1",
        status: "PUBLISHED",
      })
      .returning();

    const created = await monetizationService.createPlan({
      postId: post.id,
      replies: [{ replyText: "Direct deal https://s.shopee.vn/deal1" }],
    });

    vi.spyOn(accountService, "getDecryptedTokenForAccount").mockResolvedValue({
      token: "valid_threads_token_123",
      account: account as any,
    });

    vi.spyOn(threadsClient, "createReplyContainer").mockResolvedValue({
      id: "reply_container_555",
    });

    vi.spyOn(threadsClient, "publishContainer").mockResolvedValue({
      id: "threads_reply_777888",
    });

    const res = await replyPublisherService.processClaimedReply(created.replies[0]);

    expect(res.status).toBe("PUBLISHED");
    expect(res.threadsReplyId).toBe("threads_reply_777888");

    // Verify DB update
    const [dbReply] = await db
      .select()
      .from(affiliateReplies)
      .where(eq(affiliateReplies.id, created.replies[0].id));

    expect(dbReply.status).toBe("PUBLISHED");
    expect(dbReply.threadsReplyId).toBe("threads_reply_777888");
    expect(dbReply.threadsContainerId).toBe("reply_container_555");
    expect(dbReply.publishedAt).toBeDefined();

    // Verify Plan state updated to COMPLETED
    const [dbPlan] = await db
      .select()
      .from(monetizationPlans)
      .where(eq(monetizationPlans.id, created.plan.id));
    expect(dbPlan.status).toBe("COMPLETED");
  });

  it("handles ambiguous network failure and reconciles via conversation lookup", async () => {
    const [account] = await db
      .insert(threadsAccounts)
      .values({
        threadsUserId: "u_pub_4",
        username: "pub_user_4",
        displayName: "Pub User 4",
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
        text: "Parent post 4",
        threadsPostId: "tp_parent_recon_1",
        status: "PUBLISHED",
      })
      .returning();

    const created = await monetizationService.createPlan({
      postId: post.id,
      replies: [{ replyText: "Reconciled reply https://s.shopee.vn/recon" }],
    });

    vi.spyOn(accountService, "getDecryptedTokenForAccount").mockResolvedValue({
      token: "valid_threads_token_123",
      account: account as any,
    });

    vi.spyOn(threadsClient, "createReplyContainer").mockResolvedValue({
      id: "reply_container_recon_1",
    });

    // publishContainer throws network timeout
    vi.spyOn(threadsClient, "publishContainer").mockRejectedValue(
      new ThreadsApiError("NETWORK_ERROR", "Network request timed out", 503)
    );

    // conversation replies returns the published comment
    vi.spyOn(threadsClient, "getConversationReplies").mockResolvedValue([
      {
        id: "reconciled_reply_id_999",
        text: "Reconciled reply https://s.shopee.vn/recon",
      },
    ]);

    const res = await replyPublisherService.processClaimedReply(created.replies[0]);

    // Should successfully reconcile to PUBLISHED using found reply ID
    expect(res.status).toBe("PUBLISHED");
    expect(res.threadsReplyId).toBe("reconciled_reply_id_999");

    const [dbReply] = await db
      .select()
      .from(affiliateReplies)
      .where(eq(affiliateReplies.id, created.replies[0].id));

    expect(dbReply.status).toBe("PUBLISHED");
    expect(dbReply.threadsReplyId).toBe("reconciled_reply_id_999");
  });
});
