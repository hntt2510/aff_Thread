import { postService } from "./post.service";

export interface SchedulerRunResult {
  ok: boolean;
  claimed: number;
  published: number;
  failed: number;
  retried: number;
  durationMs: number;
  errors?: string[];
}

export class SchedulerService {
  /**
   * Executes a stateless scheduler cycle:
   * 1. Atomically claims due scheduled posts using `FOR UPDATE SKIP LOCKED`.
   * 2. Processes each claimed post with individual error isolation.
   * 3. Returns execution metrics without sensitive information.
   */
  async run(batchSize = 10): Promise<SchedulerRunResult> {
    const startTime = Date.now();
    const errors: string[] = [];

    let claimedPosts;
    try {
      claimedPosts = await postService.claimDuePosts(batchSize);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        claimed: 0,
        published: 0,
        failed: 0,
        retried: 0,
        durationMs: Date.now() - startTime,
        errors: [`Failed to claim due posts: ${msg}`],
      };
    }

    if (claimedPosts.length === 0) {
      return {
        ok: true,
        claimed: 0,
        published: 0,
        failed: 0,
        retried: 0,
        durationMs: Date.now() - startTime,
      };
    }

    let published = 0;
    let failed = 0;
    let retried = 0;

    for (const post of claimedPosts) {
      try {
        const result = await postService.processClaimedPost(post);
        if (result.status === "PUBLISHED") {
          published++;
        } else if (result.status === "SCHEDULED") {
          retried++;
        } else if (result.status === "FAILED") {
          failed++;
        }
      } catch (err: unknown) {
        failed++;
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Post ${post.id}: ${msg}`);
      }
    }

    return {
      ok: true,
      claimed: claimedPosts.length,
      published,
      failed,
      retried,
      durationMs: Date.now() - startTime,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}

export const schedulerService = new SchedulerService();
