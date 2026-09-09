import { db } from "@/db";
import {
  posts,
  threadsAccounts,
  postInsightSnapshots,
  postMonetizationState,
  monetizationPlans,
  affiliateReplies,
  affiliateReplyLinks,
  PostMonetizationState,
  MonetizationPlan,
  AffiliateReply,
  AffiliateReplyLink,
  PostInsightSnapshot,
  MonetizationEligibilityStatus,
} from "@/db/schema";
import { eq, and, desc, inArray, sql, isNotNull } from "drizzle-orm";
import { monetizationScoringService } from "./monetization-scoring.service";
import { insightsCollectorService } from "./insights-collector.service";
import { sanitizeErrorMessage } from "@/lib/errors/sanitizer";

export interface ReplyLinkInput {
  destinationUrl: string;
  label?: string;
  position?: number;
  metadataJson?: string;
}

export interface ReplyItemInput {
  replyText: string;
  sequenceNo?: number;
  scheduledAt?: string | null;
  links?: ReplyLinkInput[];
}

export interface CreateMonetizationPlanInput {
  postId: string;
  source?: "MANUAL" | "RULE_ENGINE" | "SHOPEE_DEAL_ENGINE";
  scheduledAt?: string | null;
  replies: ReplyItemInput[];
}

export interface MonetizationPostSummary {
  postId: string;
  text: string;
  threadsPostId: string | null;
  accountUsername: string;
  accountDisplayName: string;
  publishedAt: Date | null;
  monetizationState: PostMonetizationState | null;
  latestSnapshot: PostInsightSnapshot | null;
  plans: Array<MonetizationPlan & { replies: AffiliateReply[] }>;
}

export class MonetizationService {
  /**
   * Evaluates and updates the monetization state for a single post based on its latest snapshots.
   */
  async evaluatePost(postId: string): Promise<PostMonetizationState> {
    const snapshots = await insightsCollectorService.getPostSnapshots(postId, 5);
    const latestSnapshot = snapshots[0] || null;

    const [post] = await db
      .select()
      .from(posts)
      .where(eq(posts.id, postId))
      .limit(1);

    if (!post) {
      throw new Error(`Post not found: ${postId}`);
    }

    const previousSnapshots = snapshots.slice(1).map((s) => ({
      views: s.views,
      likes: s.likes,
      replies: s.replies,
      collectedAt: s.collectedAt,
    }));

    const scoreResult = monetizationScoringService.evaluateScore({
      views: latestSnapshot?.views ?? null,
      likes: latestSnapshot?.likes ?? null,
      replies: latestSnapshot?.replies ?? null,
      reposts: latestSnapshot?.reposts ?? null,
      quotes: latestSnapshot?.quotes ?? null,
      shares: latestSnapshot?.shares ?? null,
      publishedAt: post.publishedAt,
      previousSnapshots,
    });

    const [existingState] = await db
      .select()
      .from(postMonetizationState)
      .where(eq(postMonetizationState.postId, postId))
      .limit(1);

    const now = new Date();

    if (!existingState) {
      const initialStatus: MonetizationEligibilityStatus = scoreResult.isEligible ? "ELIGIBLE" : "WATCHING";
      const [newState] = await db
        .insert(postMonetizationState)
        .values({
          postId,
          status: initialStatus,
          currentScore: scoreResult.score,
          scoreVersion: scoreResult.version,
          scoreExplanation: scoreResult.explanation,
          firstEligibleAt: scoreResult.isEligible ? now : null,
          lastEvaluatedAt: now,
        })
        .returning();
      return newState;
    }

    // State machine logic:
    // If WATCHING and now reaches threshold -> ELIGIBLE
    // If already ELIGIBLE, PLANNED, MONETIZING, MONETIZED -> retain progression, update score
    let targetStatus = existingState.status;
    let firstEligibleAt = existingState.firstEligibleAt;

    if (existingState.status === "WATCHING" && scoreResult.isEligible) {
      targetStatus = "ELIGIBLE";
      firstEligibleAt = firstEligibleAt || now;
    }

    const [updatedState] = await db
      .update(postMonetizationState)
      .set({
        status: targetStatus,
        currentScore: scoreResult.score,
        scoreVersion: scoreResult.version,
        scoreExplanation: scoreResult.explanation,
        firstEligibleAt,
        lastEvaluatedAt: now,
        updatedAt: now,
      })
      .where(eq(postMonetizationState.id, existingState.id))
      .returning();

    return updatedState;
  }

  /**
   * Evaluates all published posts with active Threads accounts.
   */
  async evaluateAllActivePosts(): Promise<{ evaluatedCount: number; newlyEligibleCount: number }> {
    const publishedPosts = await db
      .select({ id: posts.id })
      .from(posts)
      .where(and(eq(posts.status, "PUBLISHED"), isNotNull(posts.threadsPostId)))
      .limit(50);

    let evaluatedCount = 0;
    let newlyEligibleCount = 0;

    for (const post of publishedPosts) {
      try {
        const previousState = await this.getMonetizationState(post.id);
        const wasEligible = previousState?.status === "ELIGIBLE" || previousState?.status === "PLANNED" || previousState?.status === "MONETIZED";

        const state = await this.evaluatePost(post.id);
        evaluatedCount++;

        if (!wasEligible && state.status === "ELIGIBLE") {
          newlyEligibleCount++;
        }
      } catch {
        // Isolate per post
      }
    }

    return { evaluatedCount, newlyEligibleCount };
  }

  /**
   * Retrieves the monetization state for a post.
   */
  async getMonetizationState(postId: string): Promise<PostMonetizationState | null> {
    const [state] = await db
      .select()
      .from(postMonetizationState)
      .where(eq(postMonetizationState.postId, postId))
      .limit(1);

    return state || null;
  }

  /**
   * Lists posts for the Monetization Management dashboard with state, score, and latest metrics.
   */
  async listMonetizationPosts(options?: {
    status?: MonetizationEligibilityStatus | "ALL";
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ posts: MonetizationPostSummary[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, options?.page ?? 1);
    const limit = Math.min(50, Math.max(1, options?.limit ?? 20));
    const offset = (page - 1) * limit;

    const baseConditions = [
      eq(posts.status, "PUBLISHED"),
      isNotNull(posts.threadsPostId),
    ];

    if (options?.search && options.search.trim()) {
      const term = `%${options.search.trim()}%`;
      baseConditions.push(
        sql`(${posts.text} ILIKE ${term} OR ${posts.accountUsername} ILIKE ${term} OR ${posts.threadsPostId} ILIKE ${term})`
      );
    }

    const eligiblePostsQuery = db
      .select({
        post: posts,
        state: postMonetizationState,
      })
      .from(posts)
      .leftJoin(postMonetizationState, eq(posts.id, postMonetizationState.postId))
      .where(and(...baseConditions));

    const allRows = await eligiblePostsQuery
      .orderBy(desc(posts.publishedAt), desc(posts.createdAt));

    // Filter by status in memory if specified
    const filteredRows = options?.status && options.status !== "ALL"
      ? allRows.filter((r) => {
          const st = r.state?.status || "WATCHING";
          return st === options.status;
        })
      : allRows;

    const total = filteredRows.length;
    const pagedRows = filteredRows.slice(offset, offset + limit);

    const summaries: MonetizationPostSummary[] = [];

    for (const { post, state } of pagedRows) {
      // Get latest snapshot
      const [latestSnapshot] = await db
        .select()
        .from(postInsightSnapshots)
        .where(eq(postInsightSnapshots.postId, post.id))
        .orderBy(desc(postInsightSnapshots.collectedAt))
        .limit(1);

      // Get plans and replies
      const plans = await db
        .select()
        .from(monetizationPlans)
        .where(eq(monetizationPlans.postId, post.id))
        .orderBy(desc(monetizationPlans.createdAt));

      const plansWithReplies = await Promise.all(
        plans.map(async (plan) => {
          const replies = await db
            .select()
            .from(affiliateReplies)
            .where(eq(affiliateReplies.monetizationPlanId, plan.id))
            .orderBy(affiliateReplies.sequenceNo);

          return { ...plan, replies };
        })
      );

      summaries.push({
        postId: post.id,
        text: post.text,
        threadsPostId: post.threadsPostId,
        accountUsername: post.accountUsername,
        accountDisplayName: post.accountDisplayName,
        publishedAt: post.publishedAt,
        monetizationState: state || null,
        latestSnapshot: latestSnapshot || null,
        plans: plansWithReplies,
      });
    }

    return {
      posts: summaries,
      total,
      page,
      limit,
    };
  }

  /**
   * Creates a monetization plan containing 1..N affiliate replies with direct URLs.
   * Enforces deterministic idempotency keys per reply.
   */
  async createPlan(input: CreateMonetizationPlanInput): Promise<{
    plan: MonetizationPlan;
    replies: Array<AffiliateReply & { links: AffiliateReplyLink[] }>;
  }> {
    const [post] = await db
      .select()
      .from(posts)
      .where(eq(posts.id, input.postId))
      .limit(1);

    if (!post) {
      throw new Error(`Post not found: ${input.postId}`);
    }

    if (!post.threadsPostId) {
      throw new Error("Cannot create monetization plan: parent post does not have a Threads Post ID");
    }

    if (!input.replies || input.replies.length === 0) {
      throw new Error("Monetization plan must contain at least one reply");
    }

    if (input.replies.length > 5) {
      throw new Error("Monetization plan cannot exceed 5 replies per plan");
    }

    // Get current post state / score
    const currentState = await this.getMonetizationState(post.id);
    const scoreAtCreation = currentState?.currentScore ?? null;

    // Validate URLs and reply text
    const validatedReplies: Array<{
      replyText: string;
      sequenceNo: number;
      scheduledAt: Date | null;
      links: ReplyLinkInput[];
    }> = [];

    for (let i = 0; i < input.replies.length; i++) {
      const rep = input.replies[i];
      let replyText = rep.replyText ? rep.replyText.trim() : "";
      const sequenceNo = rep.sequenceNo ?? i + 1;

      if (!replyText) {
        throw new Error(`Reply #${i + 1} text cannot be empty`);
      }

      if (replyText.length > 500) {
        throw new Error(`Reply #${i + 1} text exceeds 500 characters limit (current: ${replyText.length})`);
      }

      const links: ReplyLinkInput[] = [];
      if (rep.links && rep.links.length > 0) {
        if (rep.links.length > 5) {
          throw new Error(`Reply #${i + 1} cannot contain more than 5 affiliate links`);
        }

        for (let j = 0; j < rep.links.length; j++) {
          const lk = rep.links[j];
          const rawUrl = lk.destinationUrl ? lk.destinationUrl.trim() : "";

          if (!rawUrl.startsWith("http://") && !rawUrl.startsWith("https://")) {
            throw new Error(`Invalid URL "${rawUrl}" in Reply #${i + 1}: must begin with http:// or https://`);
          }

          if (rawUrl.length > 1000) {
            throw new Error(`URL in Reply #${i + 1} exceeds maximum length of 1000 characters`);
          }

          links.push({
            destinationUrl: rawUrl,
            label: lk.label?.trim() || null as any,
            position: j,
            metadataJson: lk.metadataJson || null as any,
          });

          // Ensure direct URL is present in the final reply text deterministically
          if (!replyText.includes(rawUrl)) {
            replyText = `${replyText}\n${rawUrl}`;
          }
        }
      }

      let parsedSchedule: Date | null = null;
      if (rep.scheduledAt) {
        parsedSchedule = new Date(rep.scheduledAt);
      } else if (input.scheduledAt) {
        parsedSchedule = new Date(input.scheduledAt);
      }

      validatedReplies.push({
        replyText,
        sequenceNo,
        scheduledAt: parsedSchedule,
        links,
      });
    }

    // Step 1: Insert plan
    const [plan] = await db
      .insert(monetizationPlans)
      .values({
        postId: post.id,
        status: "READY",
        source: input.source || "MANUAL",
        scoreAtCreation,
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
      })
      .returning();

    // Step 2: Insert replies and links
    const createdReplies: Array<AffiliateReply & { links: AffiliateReplyLink[] }> = [];

    for (const vRep of validatedReplies) {
      const idempotencyKey = `plan_${plan.id}_seq_${vRep.sequenceNo}`;

      const [replyRecord] = await db
        .insert(affiliateReplies)
        .values({
          monetizationPlanId: plan.id,
          postId: post.id,
          sequenceNo: vRep.sequenceNo,
          replyText: vRep.replyText,
          status: "READY",
          idempotencyKey,
          scheduledAt: vRep.scheduledAt,
        })
        .returning();

      const createdLinks: AffiliateReplyLink[] = [];
      for (const lk of vRep.links) {
        const [linkRecord] = await db
          .insert(affiliateReplyLinks)
          .values({
            affiliateReplyId: replyRecord.id,
            destinationUrl: lk.destinationUrl,
            position: lk.position ?? 0,
            label: lk.label || null,
            metadataJson: lk.metadataJson || null,
          })
          .returning();
        createdLinks.push(linkRecord);
      }

      createdReplies.push({
        ...replyRecord,
        links: createdLinks,
      });
    }

    // Step 3: Transition post monetization state to PLANNED if not already monetized
    if (currentState && currentState.status !== "MONETIZED") {
      await db
        .update(postMonetizationState)
        .set({
          status: "PLANNED",
          updatedAt: new Date(),
        })
        .where(eq(postMonetizationState.id, currentState.id));
    }

    return { plan, replies: createdReplies };
  }

  /**
   * Cancels a monetization plan and all unpublished replies.
   */
  async cancelPlan(planId: string): Promise<MonetizationPlan> {
    const [plan] = await db
      .select()
      .from(monetizationPlans)
      .where(eq(monetizationPlans.id, planId))
      .limit(1);

    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }

    await db
      .update(affiliateReplies)
      .set({
        status: "CANCELLED",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(affiliateReplies.monetizationPlanId, planId),
          inArray(affiliateReplies.status, ["READY", "PENDING", "CLAIMED"])
        )
      );

    const [updatedPlan] = await db
      .update(monetizationPlans)
      .set({
        status: "CANCELLED",
        updatedAt: new Date(),
      })
      .where(eq(monetizationPlans.id, planId))
      .returning();

    return updatedPlan;
  }
}

export const monetizationService = new MonetizationService();
