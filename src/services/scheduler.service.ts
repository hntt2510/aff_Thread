import { postService } from "./post.service";
import { sanitizeErrorMessage } from "@/lib/errors/sanitizer";

export interface SchedulerRunResult {
  ok: boolean;
  claimed: number;
  published: number;
  rescheduled: number;
  failed: number;
  staleRecovered: number;
  durationMs: number;
  errors?: string[];
}

export class SchedulerService {
  /**
   * Executes a stateless scheduler cycle:
   * 1. Safely recovers stale 'PUBLISHING' posts (stuck > 10 mins) to 'FAILED'
   *    to prevent ambiguous duplicate publishing while freeing the queue.
   * 2. Atomically claims due scheduled posts using `FOR UPDATE SKIP LOCKED`.
   * 3. Processes each claimed post with individual error isolation.
   * 4. Returns safe execution metrics without sensitive information.
   */
  async run(batchSize = 10): Promise<SchedulerRunResult> {
    const startTime = Date.now();
    const errors: string[] = [];

    // Step 1: Recover stale claims to prevent posts remaining PUBLISHING forever
    let staleRecovered = 0;
    try {
      staleRecovered = await postService.recoverStalePublishingPosts(10);
    } catch (err: unknown) {
      const sanitized = sanitizeErrorMessage(err);
      errors.push(`Stale recovery error: ${sanitized}`);
    }

    // Step 2: Atomically claim due scheduled posts
    let claimedPosts;
    try {
      claimedPosts = await postService.claimDuePosts(batchSize);
    } catch (err: unknown) {
      const sanitized = sanitizeErrorMessage(err);
      return {
        ok: false,
        claimed: 0,
        published: 0,
        rescheduled: 0,
        failed: 0,
        staleRecovered,
        durationMs: Date.now() - startTime,
        errors: [`Failed to claim due posts: ${sanitized}`],
      };
    }

    if (claimedPosts.length === 0) {
      return {
        ok: true,
        claimed: 0,
        published: 0,
        rescheduled: 0,
        failed: 0,
        staleRecovered,
        durationMs: Date.now() - startTime,
        errors: errors.length > 0 ? errors : undefined,
      };
    }

    let published = 0;
    let failed = 0;
    let rescheduled = 0;

    // Step 3: Process each claimed post with isolated failure handling
    for (const post of claimedPosts) {
      try {
        const result = await postService.processClaimedPost(post);
        if (result.status === "PUBLISHED") {
          published++;
        } else if (result.status === "SCHEDULED") {
          rescheduled++;
        } else if (result.status === "FAILED") {
          failed++;
        }
      } catch (err: unknown) {
        failed++;
        const sanitized = sanitizeErrorMessage(err);
        errors.push(`Post ${post.id}: ${sanitized}`);
      }
    }

    return {
      ok: true,
      claimed: claimedPosts.length,
      published,
      rescheduled,
      failed,
      staleRecovered,
      durationMs: Date.now() - startTime,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}

export const schedulerService = new SchedulerService();

