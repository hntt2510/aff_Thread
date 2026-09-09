import { db, getDatabaseClient } from "@/db";
import { posts, threadsAccounts, Post } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { accountService } from "./account.service";
import { threadsClient, ThreadsApiError } from "@/lib/threads/client";
import { sanitizeErrorMessage } from "@/lib/errors/sanitizer";
import {
  PostStatus,
  assertValidTransition,
} from "@/lib/posts/lifecycle";
import { determineRetryDecision } from "@/lib/posts/retry";
import { validateScheduledTime } from "@/lib/date/timezone";

export interface PostWithAccount extends Post {
  account: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
    isDisconnected?: boolean;
  } | null;
}

export class PostService {
  /**
   * Publishes a text post to Threads immediately using the official 2-stage container flow:
   * 1. Create text container (POST /me/threads with Authorization: Bearer)
   * 2. Publish container (POST /me/threads_publish with Authorization: Bearer)
   *
   * Guarantees:
   * - Token decrypted server-side only for the specified accountId
   * - Immutable snapshot of account identity (username, displayName, threadsUserId) persisted on post
   * - Strict account isolation (Account A uses Token A, Account B uses Token B)
   * - Persistent audit trail of containerId and threadsPostId
   * - Safe error recording without blind duplicate-retry risks
   * - Preserves post history even if account is later removed/disconnected
   */
  async publishTextPost(accountId: string, rawText: string): Promise<Post> {
    const text = rawText ? rawText.trim() : "";

    if (!text) {
      throw new Error("Post content cannot be empty or whitespace");
    }

    if (text.length > 500) {
      throw new Error(
        `Post content exceeds Threads limit of 500 characters (current: ${text.length})`
      );
    }

    // Load account and decrypt token server-side
    const { token: decryptedToken, account } =
      await accountService.getDecryptedTokenForAccount(accountId);

    if (account.status !== "ACTIVE") {
      throw new Error(
        `Account @${account.username} is currently in '${account.status}' status. Please verify or replace its token before publishing.`
      );
    }

    // Step 1: Create record in database with status PUBLISHING and immutable account identity snapshot
    const [initialPost] = await db
      .insert(posts)
      .values({
        accountId,
        accountThreadsUserId: account.threadsUserId,
        accountUsername: account.username,
        accountDisplayName: account.displayName,
        text,
        status: "PUBLISHING",
        publishAttempts: 1,
        lastAttemptAt: new Date(),
      })
      .returning();

    const postId = initialPost.id;

    // Step 2: Create Container on Threads
    let containerId: string;
    try {
      const containerRes = await threadsClient.createTextContainer(decryptedToken, text);
      containerId = containerRes.id;

      // Persist container ID immediately
      await db
        .update(posts)
        .set({ containerId, updatedAt: new Date() })
        .where(eq(posts.id, postId));
    } catch (err) {
      const safeMsg = sanitizeErrorMessage(err, "Failed to create Threads container");
      const errCode = err instanceof ThreadsApiError ? err.code : "CONTAINER_CREATION_FAILED";

      // If fatal auth failure, update account status
      if (err instanceof ThreadsApiError && err.code === "INVALID_TOKEN") {
        await db
          .update(threadsAccounts)
          .set({ status: "INVALID_TOKEN", updatedAt: new Date() })
          .where(eq(threadsAccounts.id, accountId));
      }

      await db
        .update(posts)
        .set({
          status: "FAILED",
          errorCode: errCode,
          errorMessage: safeMsg,
          lastError: safeMsg,
          failedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(posts.id, postId));

      throw new Error(safeMsg);
    }

    // Step 3: Publish Container
    try {
      const publishRes = await threadsClient.publishContainer(decryptedToken, containerId);
      const now = new Date();

      const [publishedPost] = await db
        .update(posts)
        .set({
          status: "PUBLISHED",
          threadsPostId: publishRes.id,
          publishedAt: now,
          updatedAt: now,
        })
        .where(eq(posts.id, postId))
        .returning();

      return publishedPost;
    } catch (err) {
      const safeMsg = sanitizeErrorMessage(err, "Failed to publish Threads container");
      const errCode = err instanceof ThreadsApiError ? err.code : "PUBLISH_FAILED";

      // If network failed after container creation, do NOT blindly retry to avoid duplicate posts
      const isAmbiguousNetworkError =
        err instanceof ThreadsApiError && err.code === "NETWORK_ERROR";
      const recordedMessage = isAmbiguousNetworkError
        ? "Network error during publish. Container was created on Threads. Needs manual review to prevent duplicate posting."
        : safeMsg;

      if (err instanceof ThreadsApiError && err.code === "INVALID_TOKEN") {
        await db
          .update(threadsAccounts)
          .set({ status: "INVALID_TOKEN", updatedAt: new Date() })
          .where(eq(threadsAccounts.id, accountId));
      }

      await db
        .update(posts)
        .set({
          status: "FAILED",
          errorCode: isAmbiguousNetworkError ? "NEEDS_MANUAL_REVIEW" : errCode,
          errorMessage: recordedMessage,
          lastError: recordedMessage,
          failedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(posts.id, postId));

      throw new Error(recordedMessage);
    }
  }

  /**
   * Schedules a post for future publication.
   */
  async schedulePost(
    accountId: string,
    rawText: string,
    scheduledAt: Date
  ): Promise<Post> {
    const text = rawText ? rawText.trim() : "";

    if (!text) {
      throw new Error("Post content cannot be empty or whitespace");
    }

    if (text.length > 500) {
      throw new Error(
        `Post content exceeds Threads limit of 500 characters (current: ${text.length})`
      );
    }

    const timeValidation = validateScheduledTime(scheduledAt, 60);
    if (!timeValidation.valid) {
      throw new Error(timeValidation.error || "Invalid scheduled time");
    }

    // Verify account exists and is ACTIVE
    const { account } = await accountService.getDecryptedTokenForAccount(accountId);
    if (account.status !== "ACTIVE") {
      throw new Error(
        `Account @${account.username} is currently '${account.status}'. Please activate before scheduling.`
      );
    }

    const [scheduledPost] = await db
      .insert(posts)
      .values({
        accountId,
        accountThreadsUserId: account.threadsUserId,
        accountUsername: account.username,
        accountDisplayName: account.displayName,
        text,
        status: "SCHEDULED",
        scheduledAt,
        publishAttempts: 0,
      })
      .returning();

    return scheduledPost;
  }

  /**
   * Atomically claims due scheduled posts using PostgreSQL `FOR UPDATE SKIP LOCKED`.
   * This guarantees that multiple serverless workers running concurrently will never
   * claim or publish the same post.
   */
  async claimDuePosts(limit = 10): Promise<Post[]> {
    const sql = getDatabaseClient();

    const claimedRows = await sql<Post[]>`
      UPDATE "posts"
      SET
        "status" = 'PUBLISHING',
        "publish_attempts" = "posts"."publish_attempts" + 1,
        "last_attempt_at" = NOW(),
        "updated_at" = NOW()
      WHERE "posts"."id" IN (
        SELECT "id"
        FROM "posts"
        WHERE "status" = 'SCHEDULED'
          AND "scheduled_at" <= NOW()
        ORDER BY "scheduled_at" ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING
        "id",
        "account_id" as "accountId",
        "account_threads_user_id" as "accountThreadsUserId",
        "account_username" as "accountUsername",
        "account_display_name" as "accountDisplayName",
        "text",
        "container_id" as "containerId",
        "threads_post_id" as "threadsPostId",
        "status",
        "error_code" as "errorCode",
        "error_message" as "errorMessage",
        "scheduled_at" as "scheduledAt",
        "failed_at" as "failedAt",
        "cancelled_at" as "cancelledAt",
        "publish_attempts" as "publishAttempts",
        "last_attempt_at" as "lastAttemptAt",
        "last_error" as "lastError",
        "created_at" as "createdAt",
        "published_at" as "publishedAt",
        "updated_at" as "updatedAt";
    `;

    return Array.from(claimedRows);
  }

  /**
   * Processes a single post that has already been claimed into 'PUBLISHING' status.
   * Handles container creation, publish, retry decisions with backoff, and terminal failure.
   */
  async processClaimedPost(post: Post): Promise<Post> {
    if (!post.accountId) {
      // Account was deleted/disconnected permanently
      const [failedPost] = await db
        .update(posts)
        .set({
          status: "FAILED",
          errorCode: "ACCOUNT_DISCONNECTED",
          errorMessage: "Associated account was deleted or disconnected",
          lastError: "Associated account was deleted or disconnected",
          failedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(posts.id, post.id))
        .returning();
      return failedPost;
    }

    let decryptedToken: string;
    try {
      const result = await accountService.getDecryptedTokenForAccount(post.accountId);
      if (result.account.status !== "ACTIVE") {
        throw new ThreadsApiError(
          "INVALID_TOKEN",
          `Account @${result.account.username} is in '${result.account.status}' status`
        );
      }
      decryptedToken = result.token;
    } catch (err) {
      const decision = determineRetryDecision(post.publishAttempts, err);

      if (decision.isFatalAccountAuth && post.accountId) {
        await db
          .update(threadsAccounts)
          .set({ status: "INVALID_TOKEN", updatedAt: new Date() })
          .where(eq(threadsAccounts.id, post.accountId));
      }

      const [updatedPost] = await db
        .update(posts)
        .set({
          status: decision.nextStatus,
          scheduledAt: decision.shouldRetry ? decision.nextScheduledAt : post.scheduledAt,
          failedAt: decision.shouldRetry ? null : new Date(),
          errorCode: decision.errorCode,
          errorMessage: decision.errorMessage,
          lastError: decision.errorMessage,
          updatedAt: new Date(),
        })
        .where(eq(posts.id, post.id))
        .returning();

      return updatedPost;
    }

    // Step 1: Create Container (or reuse existing containerId if already created in prior run)
    let containerId = post.containerId;
    if (!containerId) {
      try {
        const containerRes = await threadsClient.createTextContainer(
          decryptedToken,
          post.text
        );
        containerId = containerRes.id;
        await db
          .update(posts)
          .set({ containerId, updatedAt: new Date() })
          .where(eq(posts.id, post.id));
      } catch (err) {
        const decision = determineRetryDecision(post.publishAttempts, err);

        if (decision.isFatalAccountAuth && post.accountId) {
          await db
            .update(threadsAccounts)
            .set({ status: "INVALID_TOKEN", updatedAt: new Date() })
            .where(eq(threadsAccounts.id, post.accountId));
        }

        const [updatedPost] = await db
          .update(posts)
          .set({
            status: decision.nextStatus,
            scheduledAt: decision.shouldRetry ? decision.nextScheduledAt : post.scheduledAt,
            failedAt: decision.shouldRetry ? null : new Date(),
            errorCode: decision.errorCode,
            errorMessage: decision.errorMessage,
            lastError: decision.errorMessage,
            updatedAt: new Date(),
          })
          .where(eq(posts.id, post.id))
          .returning();

        return updatedPost;
      }
    }

    // Step 2: Publish Container
    try {
      const publishRes = await threadsClient.publishContainer(decryptedToken, containerId);
      const now = new Date();

      const [publishedPost] = await db
        .update(posts)
        .set({
          status: "PUBLISHED",
          threadsPostId: publishRes.id,
          publishedAt: now,
          updatedAt: now,
        })
        .where(eq(posts.id, post.id))
        .returning();

      return publishedPost;
    } catch (err) {
      const decision = determineRetryDecision(post.publishAttempts, err);

      if (decision.isFatalAccountAuth && post.accountId) {
        await db
          .update(threadsAccounts)
          .set({ status: "INVALID_TOKEN", updatedAt: new Date() })
          .where(eq(threadsAccounts.id, post.accountId));
      }

      const [updatedPost] = await db
        .update(posts)
        .set({
          status: decision.nextStatus,
          scheduledAt: decision.shouldRetry ? decision.nextScheduledAt : post.scheduledAt,
          failedAt: decision.shouldRetry ? null : new Date(),
          errorCode: decision.errorCode,
          errorMessage: decision.errorMessage,
          lastError: decision.errorMessage,
          updatedAt: new Date(),
        })
        .where(eq(posts.id, post.id))
        .returning();

      return updatedPost;
    }
  }

  /**
   * Cancels a scheduled or draft post.
   */
  async cancelScheduledPost(postId: string): Promise<Post> {
    const [existing] = await db
      .select()
      .from(posts)
      .where(eq(posts.id, postId))
      .limit(1);

    if (!existing) {
      throw new Error(`Post not found: ${postId}`);
    }

    assertValidTransition(existing.status, "CANCELLED");

    const [cancelledPost] = await db
      .update(posts)
      .set({
        status: "CANCELLED",
        cancelledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(posts.id, postId))
      .returning();

    return cancelledPost;
  }

  /**
   * Reschedules a scheduled or cancelled post to a new timestamp.
   */
  async reschedulePost(postId: string, newScheduledAt: Date): Promise<Post> {
    const timeValidation = validateScheduledTime(newScheduledAt, 60);
    if (!timeValidation.valid) {
      throw new Error(timeValidation.error || "Invalid scheduled time");
    }

    const [existing] = await db
      .select()
      .from(posts)
      .where(eq(posts.id, postId))
      .limit(1);

    if (!existing) {
      throw new Error(`Post not found: ${postId}`);
    }

    assertValidTransition(existing.status, "SCHEDULED");

    const [rescheduledPost] = await db
      .update(posts)
      .set({
        status: "SCHEDULED",
        scheduledAt: newScheduledAt,
        cancelledAt: null,
        failedAt: null,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(posts.id, postId))
      .returning();

    return rescheduledPost;
  }

  /**
   * Retries a failed post immediately.
   * Atomically claims the failed post into 'PUBLISHING' and executes the publish flow.
   * Preserves cumulative attempt history and audit trail (does NOT reset to 0).
   */
  async retryFailedPost(postId: string): Promise<Post> {
    const [existing] = await db
      .select()
      .from(posts)
      .where(eq(posts.id, postId))
      .limit(1);

    if (!existing) {
      throw new Error(`Post not found: ${postId}`);
    }

    assertValidTransition(existing.status, "PUBLISHING");

    const sql = getDatabaseClient();
    const [claimed] = await sql<Post[]>`
      UPDATE "posts"
      SET
        "status" = 'PUBLISHING',
        "publish_attempts" = "posts"."publish_attempts" + 1,
        "last_attempt_at" = NOW(),
        "updated_at" = NOW()
      WHERE "id" = ${postId} AND "status" = 'FAILED'
      RETURNING
        "id",
        "account_id" as "accountId",
        "account_threads_user_id" as "accountThreadsUserId",
        "account_username" as "accountUsername",
        "account_display_name" as "accountDisplayName",
        "text",
        "container_id" as "containerId",
        "threads_post_id" as "threadsPostId",
        "status",
        "error_code" as "errorCode",
        "error_message" as "errorMessage",
        "scheduled_at" as "scheduledAt",
        "failed_at" as "failedAt",
        "cancelled_at" as "cancelledAt",
        "publish_attempts" as "publishAttempts",
        "last_attempt_at" as "lastAttemptAt",
        "last_error" as "lastError",
        "created_at" as "createdAt",
        "published_at" as "publishedAt",
        "updated_at" as "updatedAt";
    `;

    if (!claimed) {
      throw new Error("Post is not in FAILED state or is already being processed");
    }

    return this.processClaimedPost(claimed);
  }

  /**
   * Recovers posts stuck in 'PUBLISHING' status for longer than `staleThresholdMinutes`.
   * To prevent duplicate posts on Threads API (ambiguous outcome protection),
   * stale claims are transitioned to terminal 'FAILED' with a descriptive error code
   * requiring manual operator review rather than blindly re-publishing.
   */
  async recoverStalePublishingPosts(staleThresholdMinutes = 10): Promise<number> {
    const sql = getDatabaseClient();
    const safeMinutes = Math.max(1, staleThresholdMinutes);
    const intervalStr = `${safeMinutes} minutes`;

    const recovered = await sql<{ id: string }[]>`
      UPDATE "posts"
      SET
        "status" = 'FAILED',
        "failed_at" = NOW(),
        "error_code" = 'STALE_PUBLISHING_TIMEOUT',
        "error_message" = 'Publish attempt timed out or worker died in PUBLISHING status. Flagged as FAILED to prevent duplicate publishing. Manual operator review required.',
        "last_error" = 'Publish attempt timed out or worker died in PUBLISHING status. Flagged as FAILED to prevent duplicate publishing. Manual operator review required.',
        "updated_at" = NOW()
      WHERE "status" = 'PUBLISHING'
        AND "last_attempt_at" <= NOW() - (${intervalStr})::interval
      RETURNING "id";
    `;

    return recovered.length;
  }

  /**
   * Retrieves post history with associated account information.
   * Supports filtering by status and limit.
   */
  async listPosts(options?: {
    status?: PostStatus;
    accountId?: string;
    limit?: number;
  }): Promise<PostWithAccount[]> {
    const limit = options?.limit || 100;

    const conditions = [];
    if (options?.status) {
      conditions.push(eq(posts.status, options.status));
    }
    if (options?.accountId) {
      conditions.push(eq(posts.accountId, options.accountId));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select({
        post: posts,
        account: {
          id: threadsAccounts.id,
          username: threadsAccounts.username,
          displayName: threadsAccounts.displayName,
          avatarUrl: threadsAccounts.avatarUrl,
        },
      })
      .from(posts)
      .leftJoin(threadsAccounts, eq(posts.accountId, threadsAccounts.id))
      .where(whereClause)
      .orderBy(desc(posts.createdAt))
      .limit(limit);

    return rows.map((r) => ({
      ...r.post,
      account: r.account?.id
        ? {
            id: r.account.id,
            username: r.account.username,
            displayName: r.account.displayName,
            avatarUrl: r.account.avatarUrl,
            isDisconnected: false,
          }
        : {
            id: r.post.accountId || "",
            username: r.post.accountUsername,
            displayName: r.post.accountDisplayName,
            avatarUrl: null,
            isDisconnected: true,
          },
    }));
  }

  /**
   * Retrieves upcoming scheduled posts ordered by scheduledAt ASC.
   */
  async listUpcomingScheduled(limit = 5): Promise<PostWithAccount[]> {
    const rows = await db
      .select({
        post: posts,
        account: {
          id: threadsAccounts.id,
          username: threadsAccounts.username,
          displayName: threadsAccounts.displayName,
          avatarUrl: threadsAccounts.avatarUrl,
        },
      })
      .from(posts)
      .leftJoin(threadsAccounts, eq(posts.accountId, threadsAccounts.id))
      .where(eq(posts.status, "SCHEDULED"))
      .orderBy(posts.scheduledAt)
      .limit(limit);

    return rows.map((r) => ({
      ...r.post,
      account: r.account?.id
        ? {
            id: r.account.id,
            username: r.account.username,
            displayName: r.account.displayName,
            avatarUrl: r.account.avatarUrl,
            isDisconnected: false,
          }
        : {
            id: r.post.accountId || "",
            username: r.post.accountUsername,
            displayName: r.post.accountDisplayName,
            avatarUrl: null,
            isDisconnected: true,
          },
    }));
  }
}

export const postService = new PostService();
