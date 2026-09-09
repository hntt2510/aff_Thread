import { db, getDatabaseClient } from "@/db";
import {
  posts,
  threadsAccounts,
  postMedia,
  postAffiliateLinks,
  affiliateLinks,
  Post,
  PostMedia,
} from "@/db/schema";
import { eq, desc, and, inArray, asc } from "drizzle-orm";
import { accountService } from "./account.service";
import { threadsClient, ThreadsApiError } from "@/lib/threads/client";
import { sanitizeErrorMessage } from "@/lib/errors/sanitizer";
import {
  PostStatus,
  PostMediaType,
  assertValidTransition,
} from "@/lib/posts/lifecycle";
import { determineRetryDecision } from "@/lib/posts/retry";
import { validateScheduledTime } from "@/lib/date/timezone";
import { validateMediaItems } from "@/lib/media/validation";
import type { MediaItemInput } from "@/lib/media/types";

export interface PostWithAccount extends Post {
  account: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
    isDisconnected?: boolean;
  } | null;
  media?: PostMedia[];
  affiliateLinks?: {
    id: string;
    publicSlug: string;
    destinationUrl: string;
    label: string | null;
  }[];
}

export interface CreatePostOptions {
  accountId: string;
  text?: string;
  mediaType?: PostMediaType;
  mediaItems?: MediaItemInput[];
  affiliateLinkIds?: string[];
}

export interface SchedulePostOptions extends CreatePostOptions {
  scheduledAt: Date;
}

export class PostService {
  /**
   * Publishes a post (TEXT, IMAGE, VIDEO, CAROUSEL) to Threads immediately using
   * the official Meta Threads multi-stage container flow.
   */
  async publishPost(options: CreatePostOptions): Promise<Post> {
    const accountId = options.accountId;
    const mediaType: PostMediaType = options.mediaType || "TEXT";
    const rawText = options.text ? options.text.trim() : "";

    if (mediaType === "TEXT" && !rawText) {
      throw new Error("Post content cannot be empty or whitespace");
    }

    if (rawText.length > 500) {
      throw new Error(
        `Post content exceeds Threads limit of 500 characters (current: ${rawText.length})`
      );
    }

    // Validate media items against mediaType constraints and SSRF rules
    const validatedMedia = validateMediaItems(mediaType, options.mediaItems);

    // Load account and decrypt token server-side
    const { token: decryptedToken, account } =
      await accountService.getDecryptedTokenForAccount(accountId);

    if (account.status !== "ACTIVE") {
      throw new Error(
        `Account @${account.username} is currently in '${account.status}' status. Please verify or replace its token before publishing.`
      );
    }

    // Step 1: Create record in database with status PUBLISHING
    const [initialPost] = await db
      .insert(posts)
      .values({
        accountId,
        accountThreadsUserId: account.threadsUserId,
        accountUsername: account.username,
        accountDisplayName: account.displayName,
        text: rawText,
        mediaType,
        status: "PUBLISHING",
        publishAttempts: 1,
        lastAttemptAt: new Date(),
      })
      .returning();

    const postId = initialPost.id;

    // Step 2: Persist media items if any
    const savedMedia: PostMedia[] = [];
    if (validatedMedia.length > 0) {
      for (const item of validatedMedia) {
        const [saved] = await db
          .insert(postMedia)
          .values({
            postId,
            mediaKind: item.mediaKind,
            sourceUrl: item.sourceUrl,
            position: item.position ?? 0,
            altText: item.altText,
            mediaAssetId: item.mediaAssetId || null,
          })
          .returning();
        savedMedia.push(saved);
      }
    }

    // Step 3: Persist affiliate links associations if any
    if (options.affiliateLinkIds && options.affiliateLinkIds.length > 0) {
      for (let i = 0; i < options.affiliateLinkIds.length; i++) {
        await db.insert(postAffiliateLinks).values({
          postId,
          affiliateLinkId: options.affiliateLinkIds[i],
          position: i,
        });
      }
    }

    // Step 4: Execute Container creation and publish flow
    try {
      return await this.executePublishFlow(decryptedToken, initialPost, savedMedia);
    } catch (err) {
      const isAmbiguousNetworkError =
        err instanceof ThreadsApiError && err.code === "NETWORK_ERROR";
      const safeMsg = sanitizeErrorMessage(err, "Failed to publish Threads post");
      const errCode = isAmbiguousNetworkError
        ? "NEEDS_MANUAL_REVIEW"
        : (err instanceof ThreadsApiError ? err.code : "PUBLISH_FAILED");
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
          errorCode: errCode,
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
   * Backwards-compatible text publishing method.
   */
  async publishTextPost(accountId: string, rawText: string): Promise<Post> {
    return this.publishPost({
      accountId,
      text: rawText,
      mediaType: "TEXT",
    });
  }

  /**
   * Schedules a post for future publication.
   * Supports both legacy signature (accountId, text, scheduledAt) and options object.
   */
  async schedulePost(
    arg1: string | SchedulePostOptions,
    arg2?: string,
    arg3?: Date
  ): Promise<Post> {
    let options: SchedulePostOptions;

    if (typeof arg1 === "string") {
      options = {
        accountId: arg1,
        text: arg2 || "",
        scheduledAt: arg3 as Date,
        mediaType: "TEXT",
      };
    } else {
      options = arg1;
    }

    const { accountId, scheduledAt, mediaType = "TEXT" } = options;
    const rawText = options.text ? options.text.trim() : "";

    if (mediaType === "TEXT" && !rawText) {
      throw new Error("Post content cannot be empty or whitespace");
    }

    if (rawText.length > 500) {
      throw new Error(
        `Post content exceeds Threads limit of 500 characters (current: ${rawText.length})`
      );
    }

    const timeValidation = validateScheduledTime(scheduledAt, 60);
    if (!timeValidation.valid) {
      throw new Error(timeValidation.error || "Invalid scheduled time");
    }

    // Validate media items
    const validatedMedia = validateMediaItems(mediaType, options.mediaItems);

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
        text: rawText,
        mediaType,
        status: "SCHEDULED",
        scheduledAt,
        publishAttempts: 0,
      })
      .returning();

    // Persist media items if any
    if (validatedMedia.length > 0) {
      for (const item of validatedMedia) {
        await db.insert(postMedia).values({
          postId: scheduledPost.id,
          mediaKind: item.mediaKind,
          sourceUrl: item.sourceUrl,
          position: item.position ?? 0,
          altText: item.altText,
          mediaAssetId: item.mediaAssetId || null,
        });
      }
    }

    // Persist affiliate links if any
    if (options.affiliateLinkIds && options.affiliateLinkIds.length > 0) {
      for (let i = 0; i < options.affiliateLinkIds.length; i++) {
        await db.insert(postAffiliateLinks).values({
          postId: scheduledPost.id,
          affiliateLinkId: options.affiliateLinkIds[i],
          position: i,
        });
      }
    }

    return scheduledPost;
  }

  /**
   * Atomically claims due scheduled posts using PostgreSQL `FOR UPDATE SKIP LOCKED`.
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
        "media_type" as "mediaType",
        "processing_status" as "processingStatus",
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
   * Processes a single claimed post in PUBLISHING status.
   */
  async processClaimedPost(post: Post): Promise<Post> {
    if (!post.accountId) {
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

    // Load existing media items for this post
    const mediaItems = await db
      .select()
      .from(postMedia)
      .where(eq(postMedia.postId, post.id))
      .orderBy(asc(postMedia.position));

    try {
      return await this.executePublishFlow(decryptedToken, post, mediaItems);
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
   * Internal publishing pipeline handling TEXT, IMAGE, VIDEO, and CAROUSEL.
   */
  private async executePublishFlow(
    decryptedToken: string,
    post: Post,
    mediaItems: PostMedia[]
  ): Promise<Post> {
    const mediaType = post.mediaType || "TEXT";
    let containerId = post.containerId;

    if (mediaType === "TEXT") {
      if (!containerId) {
        const res = await threadsClient.createTextContainer(decryptedToken, post.text);
        containerId = res.id;
        await db
          .update(posts)
          .set({ containerId, updatedAt: new Date() })
          .where(eq(posts.id, post.id));
      }
    } else if (mediaType === "IMAGE") {
      if (!containerId) {
        if (mediaItems.length === 0) {
          throw new Error("Image post is missing media item");
        }
        const img = mediaItems[0];
        const res = await threadsClient.createImageContainer(
          decryptedToken,
          img.sourceUrl,
          post.text || undefined,
          img.altText || undefined
        );
        containerId = res.id;
        await db
          .update(posts)
          .set({ containerId, updatedAt: new Date() })
          .where(eq(posts.id, post.id));
        await db
          .update(postMedia)
          .set({ containerId: res.id })
          .where(eq(postMedia.id, img.id));
      }
    } else if (mediaType === "VIDEO") {
      if (!containerId) {
        if (mediaItems.length === 0) {
          throw new Error("Video post is missing media item");
        }
        const vid = mediaItems[0];
        const res = await threadsClient.createVideoContainer(
          decryptedToken,
          vid.sourceUrl,
          post.text || undefined,
          vid.altText || undefined
        );
        containerId = res.id;
        await db
          .update(posts)
          .set({ containerId, processingStatus: "IN_PROGRESS", updatedAt: new Date() })
          .where(eq(posts.id, post.id));
        await db
          .update(postMedia)
          .set({ containerId: res.id })
          .where(eq(postMedia.id, vid.id));
      }

      // Bounded readiness check for video
      const readiness = await threadsClient.waitForContainerReady(
        decryptedToken,
        containerId,
        12000,
        2000
      );

      if (!readiness.ready) {
        // Still IN_PROGRESS: reschedule for next scheduler tick
        const nextCheck = new Date(Date.now() + 60 * 1000);
        const [deferredPost] = await db
          .update(posts)
          .set({
            status: "SCHEDULED",
            scheduledAt: nextCheck,
            processingStatus: "IN_PROGRESS",
            updatedAt: new Date(),
          })
          .where(eq(posts.id, post.id))
          .returning();
        return deferredPost;
      }
    } else if (mediaType === "CAROUSEL") {
      if (mediaItems.length < 2) {
        throw new Error("Carousel post requires at least 2 media items");
      }

      // Step A: Create child item containers if not already created
      const childContainerIds: string[] = [];
      for (const item of mediaItems) {
        let childId = item.containerId;
        if (!childId) {
          const res = await threadsClient.createCarouselItemContainer(
            decryptedToken,
            item.mediaKind as "IMAGE" | "VIDEO",
            item.sourceUrl,
            item.altText || undefined
          );
          childId = res.id;
          await db
            .update(postMedia)
            .set({ containerId: childId })
            .where(eq(postMedia.id, item.id));
          item.containerId = childId;
        }

        // If item is video, check readiness
        if (item.mediaKind === "VIDEO") {
          const readiness = await threadsClient.waitForContainerReady(
            decryptedToken,
            childId,
            10000,
            2000
          );
          if (!readiness.ready) {
            const nextCheck = new Date(Date.now() + 60 * 1000);
            const [deferredPost] = await db
              .update(posts)
              .set({
                status: "SCHEDULED",
                scheduledAt: nextCheck,
                processingStatus: "IN_PROGRESS",
                updatedAt: new Date(),
              })
              .where(eq(posts.id, post.id))
              .returning();
            return deferredPost;
          }
        }
        childContainerIds.push(childId);
      }

      // Step B: Create parent carousel container if not already created
      if (!containerId) {
        const carouselRes = await threadsClient.createCarouselContainer(
          decryptedToken,
          childContainerIds,
          post.text || undefined
        );
        containerId = carouselRes.id;
        await db
          .update(posts)
          .set({ containerId, updatedAt: new Date() })
          .where(eq(posts.id, post.id));
      }
    }

    // Step Final: Publish Container
    const publishRes = await threadsClient.publishContainer(decryptedToken, containerId!);
    const now = new Date();

    const [publishedPost] = await db
      .update(posts)
      .set({
        status: "PUBLISHED",
        processingStatus: "FINISHED",
        threadsPostId: publishRes.id,
        publishedAt: now,
        updatedAt: now,
      })
      .where(eq(posts.id, post.id))
      .returning();

    return publishedPost;
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
        "media_type" as "mediaType",
        "processing_status" as "processingStatus",
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
   * Retrieves post history with associated account information and media attachments.
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

    if (rows.length === 0) return [];

    const postIds = rows.map((r) => r.post.id);

    // Fetch media attachments for these posts
    const mediaRows = await db
      .select()
      .from(postMedia)
      .where(inArray(postMedia.postId, postIds))
      .orderBy(asc(postMedia.position));

    const mediaMap = new Map<string, PostMedia[]>();
    for (const m of mediaRows) {
      const list = mediaMap.get(m.postId) || [];
      list.push(m);
      mediaMap.set(m.postId, list);
    }

    // Fetch affiliate links for these posts
    const affiliateRows = await db
      .select({
        postId: postAffiliateLinks.postId,
        linkId: affiliateLinks.id,
        publicSlug: affiliateLinks.publicSlug,
        destinationUrl: affiliateLinks.destinationUrl,
        label: affiliateLinks.label,
      })
      .from(postAffiliateLinks)
      .innerJoin(affiliateLinks, eq(postAffiliateLinks.affiliateLinkId, affiliateLinks.id))
      .where(inArray(postAffiliateLinks.postId, postIds))
      .orderBy(asc(postAffiliateLinks.position));

    const affiliateMap = new Map<string, { id: string; publicSlug: string; destinationUrl: string; label: string | null }[]>();
    for (const a of affiliateRows) {
      const list = affiliateMap.get(a.postId) || [];
      list.push({
        id: a.linkId,
        publicSlug: a.publicSlug,
        destinationUrl: a.destinationUrl,
        label: a.label,
      });
      affiliateMap.set(a.postId, list);
    }

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
      media: mediaMap.get(r.post.id) || [],
      affiliateLinks: affiliateMap.get(r.post.id) || [],
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

    if (rows.length === 0) return [];

    const postIds = rows.map((r) => r.post.id);

    const mediaRows = await db
      .select()
      .from(postMedia)
      .where(inArray(postMedia.postId, postIds))
      .orderBy(asc(postMedia.position));

    const mediaMap = new Map<string, PostMedia[]>();
    for (const m of mediaRows) {
      const list = mediaMap.get(m.postId) || [];
      list.push(m);
      mediaMap.set(m.postId, list);
    }

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
      media: mediaMap.get(r.post.id) || [],
    }));
  }
}

export const postService = new PostService();
