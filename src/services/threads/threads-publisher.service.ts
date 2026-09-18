import { db } from "@/db";
import {
  posts,
  threadsAccounts,
  monetizationPlans,
  affiliateReplies,
  Post,
  AffiliateReply,
} from "@/db/schema";
import { eq, asc, sql } from "drizzle-orm";
import { accountService } from "@/services/account.service";
import { threadsClient, ThreadsApiError } from "@/lib/threads/client";
import { sanitizeErrorMessage } from "@/lib/errors/sanitizer";
import { monetizationService } from "@/services/monetization.service";

export interface PublishPostOptions {
  minDelayMs?: number;
  maxDelayMs?: number;
  skipDelay?: boolean;
  customReplyText?: string;
  directAffiliateUrl?: string;
}

export interface PublishResult {
  success: boolean;
  postId: string;
  threadsPostId: string;
  replyId?: string;
  threadUrl: string;
  accountUsername: string;
  publishedAt: string;
}

export interface DirectPublishInput {
  accountId: string;
  mainPostText: string;
  firstReplyText?: string;
  directAffiliateUrl?: string;
  minDelayMs?: number;
  maxDelayMs?: number;
  skipDelay?: boolean;
}

export class ThreadsPublisherService {
  /**
   * Generates a randomized natural delay (jitter) between minDelayMs (default 30s) and maxDelayMs (default 60s)
   */
  private calculateDelay(minMs = 30000, maxMs = 60000): number {
    const min = Math.max(0, minMs);
    const max = Math.max(min, maxMs);
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Publishes an existing Draft / Scheduled post to Meta Threads,
   * then waits natural cooldown delay before publishing the first reply (affiliate seeding).
   */
  async publishPostWithReply(
    postId: string,
    options?: PublishPostOptions
  ): Promise<PublishResult> {
    const [post] = await db
      .select()
      .from(posts)
      .where(eq(posts.id, postId))
      .limit(1);

    if (!post) {
      throw new Error(`Post not found: ${postId}`);
    }

    if (!post.accountId) {
      throw new Error("Post has no associated Threads account");
    }

    // 1. Load account and decrypt long-lived token server-side
    const { token, account } = await accountService.getDecryptedTokenForAccount(post.accountId);

    if (account.status !== "ACTIVE") {
      throw new ThreadsApiError(
        "INVALID_TOKEN",
        `Account @${account.username} is in '${account.status}' status. Token verification or replacement required.`
      );
    }

    // 2. Locate associated seeding comment / reply (from monetization plan or options)
    let replyText = options?.customReplyText?.trim() || null;
    let replyRecord: AffiliateReply | null = null;
    let planId: string | null = null;

    const [existingPlan] = await db
      .select()
      .from(monetizationPlans)
      .where(eq(monetizationPlans.postId, post.id))
      .limit(1);

    if (existingPlan) {
      planId = existingPlan.id;
      const replies = await db
        .select()
        .from(affiliateReplies)
        .where(eq(affiliateReplies.monetizationPlanId, existingPlan.id))
        .orderBy(asc(affiliateReplies.sequenceNo))
        .limit(1);

      if (replies.length > 0) {
        replyRecord = replies[0];
        if (!replyText) {
          replyText = replyRecord.replyText.trim();
        }
      }
    }

    // 3. Mark post as PUBLISHING
    await db
      .update(posts)
      .set({
        status: "PUBLISHING",
        publishAttempts: sql`publish_attempts + 1`,
        lastAttemptAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(posts.id, post.id));

    let publishedThreadsPostId: string;
    let publishedReplyId: string | undefined;
    const publishedAt = new Date();

    try {
      // Step A: Create Main Post Container
      const mainContainer = await threadsClient.createTextContainer(
        token,
        post.text,
        account.threadsUserId
      );

      // Step B: Publish Main Post
      const publishMainRes = await threadsClient.publishContainer(
        token,
        mainContainer.id,
        account.threadsUserId
      );
      publishedThreadsPostId = publishMainRes.id;

      // Step C: Update DB with successful main post
      await db
        .update(posts)
        .set({
          status: "PUBLISHED",
          containerId: mainContainer.id,
          threadsPostId: publishedThreadsPostId,
          publishedAt,
          lastAttemptAt: publishedAt,
          errorCode: null,
          errorMessage: null,
          lastError: null,
          updatedAt: publishedAt,
        })
        .where(eq(posts.id, post.id));
    } catch (err: unknown) {
      const safeMsg = sanitizeErrorMessage(err, "Failed to publish main post to Threads");
      const isAuthError = err instanceof ThreadsApiError && err.code === "INVALID_TOKEN";

      if (isAuthError && post.accountId) {
        await db
          .update(threadsAccounts)
          .set({
            status: "INVALID_TOKEN",
            lastCheckedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(threadsAccounts.id, post.accountId));
      }

      await db
        .update(posts)
        .set({
          status: "FAILED",
          errorCode: isAuthError ? "INVALID_TOKEN" : "API_ERROR",
          errorMessage: safeMsg,
          lastError: safeMsg,
          failedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(posts.id, post.id));

      throw err;
    }

    // 4. Sequential Reply Seeding (if reply content is provided)
    if (replyText) {
      try {
        // Natural Cooldown Delay (default: 30s to 60s random jitter)
        if (!options?.skipDelay) {
          const delayMs = this.calculateDelay(options?.minDelayMs ?? 30000, options?.maxDelayMs ?? 60000);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }

        if (replyRecord) {
          await db
            .update(affiliateReplies)
            .set({
              status: "SUBMITTING",
              lastAttemptAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(affiliateReplies.id, replyRecord.id));
        }

        // Step D: Create First Reply Container
        const replyContainer = await threadsClient.createReplyContainer(
          token,
          publishedThreadsPostId,
          replyText,
          "TEXT",
          undefined,
          account.threadsUserId
        );

        // Step E: Publish Reply
        const publishReplyRes = await threadsClient.publishContainer(
          token,
          replyContainer.id,
          account.threadsUserId
        );
        publishedReplyId = publishReplyRes.id;

        const replyPublishedAt = new Date();

        // Step F: Update DB for reply and plan
        if (replyRecord) {
          await db
            .update(affiliateReplies)
            .set({
              status: "PUBLISHED",
              threadsContainerId: replyContainer.id,
              threadsReplyId: publishedReplyId,
              publishedAt: replyPublishedAt,
              updatedAt: replyPublishedAt,
            })
            .where(eq(affiliateReplies.id, replyRecord.id));

          if (planId) {
            await db
              .update(monetizationPlans)
              .set({
                status: "COMPLETED",
                updatedAt: replyPublishedAt,
              })
              .where(eq(monetizationPlans.id, planId));
          }
        }
      } catch (replyErr: unknown) {
        console.error("Failed to publish sequential seeding reply:", replyErr);
        const safeMsg = sanitizeErrorMessage(replyErr, "Failed to publish seeding reply comment");

        if (replyRecord) {
          await db
            .update(affiliateReplies)
            .set({
              status: "FAILED",
              lastError: safeMsg,
              updatedAt: new Date(),
            })
            .where(eq(affiliateReplies.id, replyRecord.id));
        }
      }
    }

    const threadUrl = `https://www.threads.net/@${account.username}/post/${publishedThreadsPostId}`;

    return {
      success: true,
      postId: post.id,
      threadsPostId: publishedThreadsPostId,
      replyId: publishedReplyId,
      threadUrl,
      accountUsername: account.username,
      publishedAt: publishedAt.toISOString(),
    };
  }

  /**
   * Direct creation and immediate publishing from the composer UI.
   * Creates post and reply in database, then executes the sequential publishing pipeline.
   */
  async publishDirectly(input: DirectPublishInput): Promise<PublishResult> {
    const { accountId, mainPostText, firstReplyText, directAffiliateUrl } = input;

    if (!accountId || !accountId.trim()) {
      throw new Error("Missing required accountId");
    }

    if (!mainPostText || !mainPostText.trim()) {
      throw new Error("Main post text cannot be empty");
    }

    if (mainPostText.length > 500) {
      throw new Error(`Main post exceeds Threads 500 characters limit (${mainPostText.length} chars)`);
    }

    // 1. Create draft post in DB
    const { account } = await accountService.getDecryptedTokenForAccount(accountId);

    const [createdPost] = await db
      .insert(posts)
      .values({
        id: crypto.randomUUID(),
        accountId,
        accountThreadsUserId: account.threadsUserId,
        accountUsername: account.username,
        accountDisplayName: account.displayName,
        text: mainPostText.trim(),
        mediaType: "TEXT",
        status: "DRAFT",
        publishAttempts: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    // 2. Attach first reply plan if replyText exists
    if (firstReplyText && firstReplyText.trim()) {
      await monetizationService.createPlan({
        postId: createdPost.id,
        source: "SHOPEE_DEAL_ENGINE",
        replies: [
          {
            sequenceNo: 1,
            replyText: firstReplyText.trim(),
            links: directAffiliateUrl
              ? [
                  {
                    destinationUrl: directAffiliateUrl.trim(),
                    metadataJson: JSON.stringify({
                      platform: "shopee",
                      affiliateType: "DIRECT",
                      isDirectShopee: true,
                    }),
                  },
                ]
              : [],
          },
        ],
      });
    }

    // 3. Execute publishing pipeline
    return await this.publishPostWithReply(createdPost.id, {
      minDelayMs: input.minDelayMs,
      maxDelayMs: input.maxDelayMs,
      skipDelay: input.skipDelay,
      customReplyText: firstReplyText,
      directAffiliateUrl,
    });
  }

  /**
   * Schedules a draft post for future publication.
   */
  async schedulePost(postId: string, scheduledAt: string | Date): Promise<Post> {
    const targetDate = typeof scheduledAt === "string" ? new Date(scheduledAt) : scheduledAt;

    if (isNaN(targetDate.getTime())) {
      throw new Error("Invalid scheduledAt timestamp");
    }

    if (targetDate.getTime() <= Date.now()) {
      throw new Error("Scheduled time must be in the future");
    }

    const [existing] = await db
      .select()
      .from(posts)
      .where(eq(posts.id, postId))
      .limit(1);

    if (!existing) {
      throw new Error(`Post not found: ${postId}`);
    }

    const [updatedPost] = await db
      .update(posts)
      .set({
        status: "SCHEDULED",
        scheduledAt: targetDate,
        cancelledAt: null,
        failedAt: null,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(posts.id, postId))
      .returning();

    // Also update associated monetization plan & reply schedule if any
    const plans = await db
      .select()
      .from(monetizationPlans)
      .where(eq(monetizationPlans.postId, postId));

    for (const p of plans) {
      await db
        .update(monetizationPlans)
        .set({
          status: "READY",
          scheduledAt: targetDate,
          updatedAt: new Date(),
        })
        .where(eq(monetizationPlans.id, p.id));

      await db
        .update(affiliateReplies)
        .set({
          status: "READY",
          scheduledAt: targetDate,
          updatedAt: new Date(),
        })
        .where(eq(affiliateReplies.monetizationPlanId, p.id));
    }

    return updatedPost;
  }
}

export const threadsPublisherService = new ThreadsPublisherService();
