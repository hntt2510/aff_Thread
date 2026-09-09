import { db } from "@/db";
import { posts, threadsAccounts, postInsightSnapshots, PostInsightSnapshot } from "@/db/schema";
import { eq, and, isNotNull, desc, gt } from "drizzle-orm";
import { accountService } from "./account.service";
import { threadsClient } from "@/lib/threads/client";
import { sanitizeErrorMessage } from "@/lib/errors/sanitizer";

export interface InsightsCollectionResult {
  collectedCount: number;
  failedCount: number;
  skippedCount: number;
  errors: string[];
  snapshots: PostInsightSnapshot[];
}

export interface CollectInsightsOptions {
  maxPosts?: number;
  minIntervalMinutes?: number;
  targetPostId?: string;
}

export class InsightsCollectorService {
  /**
   * Collects official post insights for eligible published Threads posts.
   * Handles error isolation per post so that one failed account/post does not abort the run.
   */
  async collectInsights(options?: CollectInsightsOptions): Promise<InsightsCollectionResult> {
    const maxPosts = options?.maxPosts ?? 25;
    const minIntervalMinutes = options?.minIntervalMinutes ?? 10;
    const errors: string[] = [];
    const snapshots: PostInsightSnapshot[] = [];
    let collectedCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    // 1. Query eligible published posts with valid Threads post IDs
    const baseConditions = [
      eq(posts.status, "PUBLISHED"),
      isNotNull(posts.threadsPostId),
      isNotNull(posts.accountId),
    ];

    if (options?.targetPostId) {
      baseConditions.push(eq(posts.id, options.targetPostId));
    }

    const eligiblePosts = await db
      .select({
        post: posts,
        account: threadsAccounts,
      })
      .from(posts)
      .innerJoin(threadsAccounts, eq(posts.accountId, threadsAccounts.id))
      .where(and(...baseConditions, eq(threadsAccounts.status, "ACTIVE")))
      .orderBy(desc(posts.publishedAt), desc(posts.createdAt))
      .limit(maxPosts);

    if (eligiblePosts.length === 0) {
      return {
        collectedCount: 0,
        failedCount: 0,
        skippedCount: 0,
        errors: [],
        snapshots: [],
      };
    }

    const cutoffTime = new Date(Date.now() - minIntervalMinutes * 60 * 1000);

    for (const { post, account } of eligiblePosts) {
      if (!post.threadsPostId) continue;

      // 2. Throttle collection: check if snapshot already collected recently for this post
      if (!options?.targetPostId) {
        const [recentSnapshot] = await db
          .select({ id: postInsightSnapshots.id })
          .from(postInsightSnapshots)
          .where(
            and(
              eq(postInsightSnapshots.postId, post.id),
              gt(postInsightSnapshots.collectedAt, cutoffTime)
            )
          )
          .limit(1);

        if (recentSnapshot) {
          skippedCount++;
          continue;
        }
      }

      // 3. Collect from Meta API with per-post error isolation
      try {
        const { token: accessToken } = await accountService.getDecryptedTokenForAccount(account.id);
        const insights = await threadsClient.getPostInsights(accessToken, post.threadsPostId);

        const [newSnapshot] = await db
          .insert(postInsightSnapshots)
          .values({
            postId: post.id,
            threadsPostId: post.threadsPostId,
            views: insights.views,
            likes: insights.likes,
            replies: insights.replies,
            reposts: insights.reposts,
            quotes: insights.quotes,
            shares: insights.shares,
            rawMetricsJson: JSON.stringify(insights.rawMetricsJson),
            collectedAt: new Date(),
          })
          .returning();

        snapshots.push(newSnapshot);
        collectedCount++;
      } catch (err: unknown) {
        failedCount++;
        const sanitized = sanitizeErrorMessage(err);
        errors.push(`Post ${post.id} (${post.threadsPostId}): ${sanitized}`);
      }
    }

    return {
      collectedCount,
      failedCount,
      skippedCount,
      errors,
      snapshots,
    };
  }

  /**
   * Retrieves historical snapshots for a specific post in descending order.
   */
  async getPostSnapshots(postId: string, limit = 20): Promise<PostInsightSnapshot[]> {
    return db
      .select()
      .from(postInsightSnapshots)
      .where(eq(postInsightSnapshots.postId, postId))
      .orderBy(desc(postInsightSnapshots.collectedAt))
      .limit(limit);
  }
}

export const insightsCollectorService = new InsightsCollectorService();
