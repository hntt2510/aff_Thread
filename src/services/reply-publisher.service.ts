import { db } from "@/db";
import {
  posts,
  threadsAccounts,
  monetizationPlans,
  affiliateReplies,
  postMonetizationState,
  AffiliateReply,
} from "@/db/schema";
import { eq, and, inArray, lte, isNull, or, desc, sql } from "drizzle-orm";
import { accountService } from "./account.service";
import { threadsClient, ThreadsApiError } from "@/lib/threads/client";
import { sanitizeErrorMessage } from "@/lib/errors/sanitizer";

export type ReplyExecutionResultStatus =
  | "PUBLISHED"
  | "DEFERRED"
  | "BLOCKED"
  | "AMBIGUOUS"
  | "FAILED";

export interface ReplyExecutionResult {
  replyId: string;
  status: ReplyExecutionResultStatus;
  threadsReplyId?: string;
  reason?: string;
  error?: string;
}

export class ReplyPublisherService {
  private minReplyCooldownMs = 30 * 1000; // 30 seconds minimum between sequence replies

  /**
   * Atomically claims due affiliate replies using FOR UPDATE SKIP LOCKED.
   */
  async claimDueReplies(batchSize = 5): Promise<AffiliateReply[]> {
    const now = new Date();

    const dueReplies = await db.transaction(async (tx) => {
      // Find candidate replies
      const candidates = await tx
        .select()
        .from(affiliateReplies)
        .where(
          and(
            inArray(affiliateReplies.status, ["READY", "PENDING"]),
            or(isNull(affiliateReplies.scheduledAt), lte(affiliateReplies.scheduledAt, now)),
            or(isNull(affiliateReplies.nextEligibleAt), lte(affiliateReplies.nextEligibleAt, now))
          )
        )
        .orderBy(affiliateReplies.sequenceNo, affiliateReplies.createdAt)
        .limit(batchSize)
        .for("update", { skipLocked: true });

      if (candidates.length === 0) {
        return [];
      }

      const candidateIds = candidates.map((c) => c.id);

      // Atomically mark claimed
      await tx
        .update(affiliateReplies)
        .set({
          status: "CLAIMED",
          lastAttemptAt: now,
          updatedAt: now,
        })
        .where(inArray(affiliateReplies.id, candidateIds));

      return candidates;
    });

    return dueReplies;
  }

  /**
   * Processes a single claimed reply with strict sequence ordering, cooldown, and ambiguous recovery.
   */
  async processClaimedReply(reply: AffiliateReply): Promise<ReplyExecutionResult> {
    const now = new Date();

    // 1. Check sequence ordering within the plan
    const priorReplies = await db
      .select()
      .from(affiliateReplies)
      .where(
        and(
          eq(affiliateReplies.monetizationPlanId, reply.monetizationPlanId),
          sql`${affiliateReplies.sequenceNo} < ${reply.sequenceNo}`
        )
      )
      .orderBy(affiliateReplies.sequenceNo);

    // If any prior reply is in progress or pending, defer this reply
    const hasUnfinishedPrior = priorReplies.some(
      (r) => r.status === "READY" || r.status === "PENDING" || r.status === "CLAIMED" || r.status === "SUBMITTING"
    );

    if (hasUnfinishedPrior) {
      await db
        .update(affiliateReplies)
        .set({ status: "READY", updatedAt: now })
        .where(eq(affiliateReplies.id, reply.id));

      return {
        replyId: reply.id,
        status: "DEFERRED",
        reason: "Previous reply in sequence is not yet published",
      };
    }

    // If any prior reply failed or is ambiguous, block this reply
    const hasFailedPrior = priorReplies.some(
      (r) => r.status === "FAILED" || r.status === "AMBIGUOUS" || r.status === "CANCELLED"
    );

    if (hasFailedPrior) {
      await db
        .update(affiliateReplies)
        .set({
          status: "PENDING",
          lastError: "Blocked: prior reply in sequence failed or requires attention",
          updatedAt: now,
        })
        .where(eq(affiliateReplies.id, reply.id));

      return {
        replyId: reply.id,
        status: "BLOCKED",
        reason: "Prior reply in sequence failed or requires attention",
      };
    }

    // 2. Cooldown check: verify prior reply publication time
    if (priorReplies.length > 0) {
      const lastPrior = priorReplies[priorReplies.length - 1];
      if (lastPrior.publishedAt) {
        const timeSincePrior = now.getTime() - new Date(lastPrior.publishedAt).getTime();
        if (timeSincePrior < this.minReplyCooldownMs) {
          await db
            .update(affiliateReplies)
            .set({ status: "READY", updatedAt: now })
            .where(eq(affiliateReplies.id, reply.id));

          return {
            replyId: reply.id,
            status: "DEFERRED",
            reason: `Cooldown active: waiting ${Math.ceil((this.minReplyCooldownMs - timeSincePrior) / 1000)}s`,
          };
        }
      }
    }

    // 3. Load post and account credentials
    const [post] = await db
      .select()
      .from(posts)
      .where(eq(posts.id, reply.postId))
      .limit(1);

    if (!post || !post.threadsPostId || !post.accountId) {
      await db
        .update(affiliateReplies)
        .set({
          status: "FAILED",
          lastError: "Parent post or Threads post ID not found",
          updatedAt: now,
        })
        .where(eq(affiliateReplies.id, reply.id));

      return {
        replyId: reply.id,
        status: "FAILED",
        error: "Parent post or Threads post ID not found",
      };
    }

    let accessToken: string;
    try {
      const res = await accountService.getDecryptedTokenForAccount(post.accountId);
      accessToken = res.token;
    } catch (err) {
      const sanitized = sanitizeErrorMessage(err);
      await db
        .update(affiliateReplies)
        .set({
          status: "FAILED",
          lastError: `Failed to decrypt account token: ${sanitized}`,
          updatedAt: now,
        })
        .where(eq(affiliateReplies.id, reply.id));

      return {
        replyId: reply.id,
        status: "FAILED",
        error: sanitized,
      };
    }

    // 4. Mark SUBMITTING and increment attempts
    await db
      .update(affiliateReplies)
      .set({
        status: "SUBMITTING",
        attempts: reply.attempts + 1,
        lastAttemptAt: now,
        updatedAt: now,
      })
      .where(eq(affiliateReplies.id, reply.id));

    // Step A: Create container
    let containerId = reply.threadsContainerId;
    if (!containerId) {
      try {
        const containerRes = await threadsClient.createReplyContainer(
          accessToken,
          post.threadsPostId,
          reply.replyText
        );
        containerId = containerRes.id;

        await db
          .update(affiliateReplies)
          .set({
            threadsContainerId: containerId,
            updatedAt: new Date(),
          })
          .where(eq(affiliateReplies.id, reply.id));
      } catch (err: unknown) {
        const sanitized = sanitizeErrorMessage(err);
        await db
          .update(affiliateReplies)
          .set({
            status: "FAILED",
            lastError: sanitized,
            updatedAt: new Date(),
          })
          .where(eq(affiliateReplies.id, reply.id));

        return {
          replyId: reply.id,
          status: "FAILED",
          error: sanitized,
        };
      }
    }

    // Step B: Publish container with ambiguous failure guard
    try {
      const pubRes = await threadsClient.publishContainer(accessToken, containerId);
      const threadsReplyId = pubRes.id;
      const publishedAt = new Date();

      // Successfully published!
      await db
        .update(affiliateReplies)
        .set({
          status: "PUBLISHED",
          threadsReplyId,
          publishedAt,
          updatedAt: publishedAt,
          lastError: null,
        })
        .where(eq(affiliateReplies.id, reply.id));

      // Advance next sequential reply with deterministic nextEligibleAt cooldown
      const nextEligibleTime = new Date(publishedAt.getTime() + this.minReplyCooldownMs);
      await db
        .update(affiliateReplies)
        .set({
          status: "READY",
          nextEligibleAt: nextEligibleTime,
          updatedAt: publishedAt,
        })
        .where(
          and(
            eq(affiliateReplies.monetizationPlanId, reply.monetizationPlanId),
            eq(affiliateReplies.sequenceNo, reply.sequenceNo + 1),
            eq(affiliateReplies.status, "PENDING")
          )
        );

      // Update plan and post monetization states
      await this.updatePlanAndPostStateAfterPublish(reply.monetizationPlanId, reply.postId);

      return {
        replyId: reply.id,
        status: "PUBLISHED",
        threadsReplyId,
      };
    } catch (err: unknown) {
      const isNetworkError =
        (err instanceof ThreadsApiError && err.code === "NETWORK_ERROR") ||
        (err instanceof Error && err.message.toLowerCase().includes("network"));

      const sanitized = sanitizeErrorMessage(err);

      // Attempt immediate automated reconciliation via conversation inspection
      const reconciledReplyId = await this.tryReconcilePublishedReply(
        accessToken,
        post.threadsPostId,
        reply.replyText
      );

      if (reconciledReplyId) {
        const publishedAt = new Date();
        await db
          .update(affiliateReplies)
          .set({
            status: "PUBLISHED",
            threadsReplyId: reconciledReplyId,
            publishedAt,
            updatedAt: publishedAt,
            lastError: null,
          })
          .where(eq(affiliateReplies.id, reply.id));

        await this.updatePlanAndPostStateAfterPublish(reply.monetizationPlanId, reply.postId);

        return {
          replyId: reply.id,
          status: "PUBLISHED",
          threadsReplyId: reconciledReplyId,
        };
      }

      if (isNetworkError) {
        // Network timeout / unknown response -> flag as AMBIGUOUS to prevent duplicate comments
        await db
          .update(affiliateReplies)
          .set({
            status: "AMBIGUOUS",
            lastError: `Publish response unconfirmed: ${sanitized}`,
            updatedAt: new Date(),
          })
          .where(eq(affiliateReplies.id, reply.id));

        return {
          replyId: reply.id,
          status: "AMBIGUOUS",
          reason: "Network error during publish. Flagged as AMBIGUOUS to prevent duplicate public comments.",
        };
      }

      // Definite API error (e.g. rate limit, permission) -> mark FAILED
      await db
        .update(affiliateReplies)
        .set({
          status: "FAILED",
          lastError: sanitized,
          updatedAt: new Date(),
        })
        .where(eq(affiliateReplies.id, reply.id));

      return {
        replyId: reply.id,
        status: "FAILED",
        error: sanitized,
      };
    }
  }

  /**
   * Attempts to reconcile whether a reply was already published by inspecting conversation replies.
   */
  async tryReconcilePublishedReply(
    accessToken: string,
    threadsPostId: string,
    expectedReplyText: string
  ): Promise<string | null> {
    try {
      const replies = await threadsClient.getConversationReplies(accessToken, threadsPostId);
      const normalizedExpected = expectedReplyText.trim();

      for (const rep of replies) {
        if (rep.text && rep.text.trim() === normalizedExpected) {
          return rep.id;
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  private async updatePlanAndPostStateAfterPublish(planId: string, postId: string): Promise<void> {
    const allPlanReplies = await db
      .select({ status: affiliateReplies.status })
      .from(affiliateReplies)
      .where(eq(affiliateReplies.monetizationPlanId, planId));

    const allPublished = allPlanReplies.every((r) => r.status === "PUBLISHED");
    const targetPlanStatus = allPublished ? "COMPLETED" : "RUNNING";

    await db
      .update(monetizationPlans)
      .set({
        status: targetPlanStatus,
        updatedAt: new Date(),
      })
      .where(eq(monetizationPlans.id, planId));

    // Update post monetization state to MONETIZED
    const [state] = await db
      .select()
      .from(postMonetizationState)
      .where(eq(postMonetizationState.postId, postId))
      .limit(1);

    if (state) {
      await db
        .update(postMonetizationState)
        .set({
          status: "MONETIZED",
          updatedAt: new Date(),
        })
        .where(eq(postMonetizationState.id, state.id));
    }
  }
}

export const replyPublisherService = new ReplyPublisherService();
