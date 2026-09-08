import { db } from "@/db";
import { posts, threadsAccounts, Post } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { accountService } from "./account.service";
import { threadsClient, ThreadsApiError } from "@/lib/threads/client";
import { sanitizeErrorMessage } from "@/lib/errors/sanitizer";

export interface PostWithAccount extends Post {
  account: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  } | null;
}

export class PostService {
  /**
   * Publishes a text post to Threads using the official 2-stage container flow:
   * 1. Create text container (POST /me/threads)
   * 2. Publish container (POST /me/threads_publish)
   *
   * Guarantees:
   * - Token decrypted server-side only for the specified accountId
   * - Strict account isolation (Account A uses Token A, Account B uses Token B)
   * - Persistent audit trail of containerId and threadsPostId
   * - Safe error recording without blind duplicate-retry risks
   */
  async publishTextPost(accountId: string, rawText: string): Promise<Post> {
    const text = rawText ? rawText.trim() : "";

    if (!text) {
      throw new Error("Post content cannot be empty or whitespace");
    }

    if (text.length > 500) {
      throw new Error(`Post content exceeds Threads limit of 500 characters (current: ${text.length})`);
    }

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
        text,
        status: "PUBLISHING",
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
        .set({ containerId })
        .where(eq(posts.id, postId));
    } catch (err) {
      const safeMsg = sanitizeErrorMessage(err, "Failed to create Threads container");
      const errCode = err instanceof ThreadsApiError ? err.code : "CONTAINER_CREATION_FAILED";

      await db
        .update(posts)
        .set({
          status: "FAILED",
          errorCode: errCode,
          errorMessage: safeMsg,
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

      await db
        .update(posts)
        .set({
          status: "FAILED",
          errorCode: isAmbiguousNetworkError ? "NEEDS_MANUAL_REVIEW" : errCode,
          errorMessage: recordedMessage,
        })
        .where(eq(posts.id, postId));

      throw new Error(recordedMessage);
    }
  }

  /**
   * Retrieves post history with associated account information.
   */
  async listPosts(limit = 50): Promise<PostWithAccount[]> {
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
      .orderBy(desc(posts.createdAt))
      .limit(limit);

    return rows.map((r) => ({
      ...r.post,
      account: r.account,
    }));
  }
}

export const postService = new PostService();
