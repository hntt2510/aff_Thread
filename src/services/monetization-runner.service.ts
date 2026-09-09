import { db } from "@/db";
import { monetizationRuns, MonetizationRun } from "@/db/schema";
import { insightsCollectorService } from "./insights-collector.service";
import { monetizationService } from "./monetization.service";
import { replyPublisherService } from "./reply-publisher.service";
import { sanitizeErrorMessage } from "@/lib/errors/sanitizer";
import { desc } from "drizzle-orm";

export interface MonetizationRunResult {
  ok: boolean;
  runId?: string;
  collected: number;
  evaluated: number;
  eligible: number;
  repliesClaimed: number;
  repliesPublished: number;
  repliesDeferred: number;
  repliesFailed: number;
  ambiguous: number;
  durationMs: number;
  errors?: string[];
}

export interface MonetizationRunOptions {
  triggerSource?: string;
  maxCollect?: number;
  maxReplies?: number;
}

export class MonetizationRunnerService {
  /**
   * Executes a complete monetization cycle:
   * 1. Collects official post insights for active published posts.
   * 2. Evaluates post engagement scoring & updates eligibility states.
   * 3. Atomically claims due affiliate replies.
   * 4. Publishes replies with sequence enforcement, cooldown, and ambiguous protection.
   * 5. Persists telemetry in monetization_runs for observability.
   */
  async run(options?: MonetizationRunOptions): Promise<MonetizationRunResult> {
    const startTime = Date.now();
    const triggerSource = options?.triggerSource || "cron-job-org";
    const errors: string[] = [];

    let collected = 0;
    let evaluated = 0;
    let eligible = 0;
    let repliesClaimed = 0;
    let repliesPublished = 0;
    let repliesDeferred = 0;
    let repliesFailed = 0;
    let ambiguous = 0;

    // Step 1: Collect Insights
    try {
      const collectRes = await insightsCollectorService.collectInsights({
        maxPosts: options?.maxCollect ?? 25,
      });
      collected = collectRes.collectedCount;
      if (collectRes.errors.length > 0) {
        errors.push(...collectRes.errors);
      }
    } catch (err: unknown) {
      const sanitized = sanitizeErrorMessage(err);
      errors.push(`Insights collection error: ${sanitized}`);
    }

    // Step 2: Evaluate Scoring & Eligibility
    try {
      const evalRes = await monetizationService.evaluateAllActivePosts();
      evaluated = evalRes.evaluatedCount;
      eligible = evalRes.newlyEligibleCount;
    } catch (err: unknown) {
      const sanitized = sanitizeErrorMessage(err);
      errors.push(`Scoring evaluation error: ${sanitized}`);
    }

    // Step 3: Claim Due Replies
    let claimedReplies: Awaited<ReturnType<typeof replyPublisherService.claimDueReplies>> = [];
    try {
      claimedReplies = await replyPublisherService.claimDueReplies(options?.maxReplies ?? 10);
      repliesClaimed = claimedReplies.length;
    } catch (err: unknown) {
      const sanitized = sanitizeErrorMessage(err);
      errors.push(`Reply claim error: ${sanitized}`);
      claimedReplies = [];
    }

    // Step 4: Process Claimed Replies
    for (const reply of claimedReplies) {
      try {
        const res = await replyPublisherService.processClaimedReply(reply);
        if (res.status === "PUBLISHED") {
          repliesPublished++;
        } else if (res.status === "DEFERRED") {
          repliesDeferred++;
        } else if (res.status === "BLOCKED" || res.status === "FAILED") {
          repliesFailed++;
          if (res.error) errors.push(`Reply ${reply.id}: ${res.error}`);
        } else if (res.status === "AMBIGUOUS") {
          ambiguous++;
          if (res.reason) errors.push(`Reply ${reply.id} AMBIGUOUS: ${res.reason}`);
        }
      } catch (err: unknown) {
        repliesFailed++;
        const sanitized = sanitizeErrorMessage(err);
        errors.push(`Reply ${reply.id} uncaught error: ${sanitized}`);
      }
    }

    const durationMs = Date.now() - startTime;

    // Step 5: Record Run Telemetry
    let runId: string | undefined;
    try {
      const [inserted] = await db
        .insert(monetizationRuns)
        .values({
          startedAt: new Date(startTime),
          finishedAt: new Date(),
          triggerSource,
          collected,
          evaluated,
          eligible,
          repliesClaimed,
          repliesPublished,
          repliesDeferred,
          repliesFailed,
          ambiguous,
          durationMs,
          sanitizedError: errors.length > 0 ? errors.slice(0, 5).join("; ") : null,
        })
        .returning({ id: monetizationRuns.id });
      runId = inserted?.id;
    } catch {
      // Do not fail runner if telemetry insert fails
    }

    return {
      ok: errors.length === 0 || repliesPublished > 0 || collected > 0,
      runId,
      collected,
      evaluated,
      eligible,
      repliesClaimed,
      repliesPublished,
      repliesDeferred,
      repliesFailed,
      ambiguous,
      durationMs,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Retrieves recent monetization runs for observability dashboard.
   */
  async getRecentRuns(limit = 10): Promise<MonetizationRun[]> {
    return db
      .select()
      .from(monetizationRuns)
      .orderBy(desc(monetizationRuns.startedAt))
      .limit(limit);
  }
}

export const monetizationRunnerService = new MonetizationRunnerService();
