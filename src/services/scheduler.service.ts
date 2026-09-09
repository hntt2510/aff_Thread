import { db } from "@/db";
import { schedulerRuns, SchedulerRun } from "@/db/schema";
import { postService } from "./post.service";
import { sanitizeErrorMessage } from "@/lib/errors/sanitizer";
import { desc } from "drizzle-orm";

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

export interface SchedulerHealth {
  status: "HEALTHY" | "DEGRADED" | "STALE" | "UNKNOWN";
  lastRun: SchedulerRun | null;
  lastSeenMinutesAgo: number | null;
}

export class SchedulerService {
  /**
   * Executes a stateless scheduler cycle:
   * 1. Safely recovers stale 'PUBLISHING' posts (stuck > 10 mins) to 'FAILED'
   *    to prevent ambiguous duplicate publishing while freeing the queue.
   * 2. Atomically claims due scheduled posts using `FOR UPDATE SKIP LOCKED`.
   * 3. Processes each claimed post with individual error isolation.
   * 4. Persists run execution metrics into `scheduler_runs` for production observability.
   */
  async run(batchSize = 10, triggerSource = "cron-job-org"): Promise<SchedulerRunResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let staleRecovered = 0;
    let claimed = 0;
    let published = 0;
    let failed = 0;
    let rescheduled = 0;

    // Step 1: Recover stale claims to prevent posts remaining PUBLISHING forever
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
      claimed = claimedPosts.length;
    } catch (err: unknown) {
      const sanitized = sanitizeErrorMessage(err);
      errors.push(`Failed to claim due posts: ${sanitized}`);

      const durationMs = Date.now() - startTime;
      await this.recordRun({
        startedAt: new Date(startTime),
        finishedAt: new Date(),
        triggerSource,
        claimed: 0,
        published: 0,
        rescheduled: 0,
        failed: 0,
        staleRecovered,
        durationMs,
        sanitizedError: errors.join("; "),
      });

      return {
        ok: false,
        claimed: 0,
        published: 0,
        rescheduled: 0,
        failed: 0,
        staleRecovered,
        durationMs,
        errors,
      };
    }

    // Step 3: Process each claimed post with isolated failure handling
    if (claimedPosts.length > 0) {
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
    }

    const durationMs = Date.now() - startTime;
    await this.recordRun({
      startedAt: new Date(startTime),
      finishedAt: new Date(),
      triggerSource,
      claimed,
      published,
      rescheduled,
      failed,
      staleRecovered,
      durationMs,
      sanitizedError: errors.length > 0 ? errors.join("; ") : null,
    });

    return {
      ok: true,
      claimed,
      published,
      rescheduled,
      failed,
      staleRecovered,
      durationMs,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  private async recordRun(data: {
    startedAt: Date;
    finishedAt: Date;
    triggerSource: string;
    claimed: number;
    published: number;
    rescheduled: number;
    failed: number;
    staleRecovered: number;
    durationMs: number;
    sanitizedError: string | null;
  }): Promise<void> {
    try {
      await db.insert(schedulerRuns).values({
        startedAt: data.startedAt,
        finishedAt: data.finishedAt,
        triggerSource: data.triggerSource,
        claimed: data.claimed,
        published: data.published,
        rescheduled: data.rescheduled,
        failed: data.failed,
        staleRecovered: data.staleRecovered,
        durationMs: data.durationMs,
        sanitizedError: data.sanitizedError,
      });
    } catch {
      // Non-blocking: failure to record observability must not fail the scheduler cycle
    }
  }

  /**
   * Evaluates scheduler health based on latest recorded heartbeat.
   * - HEALTHY: Executed within last 3 minutes (matches 1-minute cadence)
   * - DEGRADED: Executed within last 3-10 minutes
   * - STALE: Not executed in over 10 minutes
   * - UNKNOWN: No runs recorded yet
   */
  async getSchedulerHealth(): Promise<SchedulerHealth> {
    try {
      const [lastRun] = await db
        .select()
        .from(schedulerRuns)
        .orderBy(desc(schedulerRuns.startedAt))
        .limit(1);

      if (!lastRun) {
        return {
          status: "UNKNOWN",
          lastRun: null,
          lastSeenMinutesAgo: null,
        };
      }

      const diffMinutes = Math.floor((Date.now() - lastRun.startedAt.getTime()) / 60000);

      let status: "HEALTHY" | "DEGRADED" | "STALE" = "HEALTHY";
      if (diffMinutes > 10) {
        status = "STALE";
      } else if (diffMinutes > 3) {
        status = "DEGRADED";
      }

      return {
        status,
        lastRun,
        lastSeenMinutesAgo: diffMinutes,
      };
    } catch {
      return {
        status: "UNKNOWN",
        lastRun: null,
        lastSeenMinutesAgo: null,
      };
    }
  }

  /**
   * Retrieves recent scheduler runs for observability dashboard.
   */
  async listRecentRuns(limit = 10): Promise<SchedulerRun[]> {
    try {
      return await db
        .select()
        .from(schedulerRuns)
        .orderBy(desc(schedulerRuns.startedAt))
        .limit(limit);
    } catch {
      return [];
    }
  }
}

export const schedulerService = new SchedulerService();
