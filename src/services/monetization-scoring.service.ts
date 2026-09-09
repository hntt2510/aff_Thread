export interface ScoringSignalInput {
  views: number | null;
  likes: number | null;
  replies: number | null;
  reposts: number | null;
  quotes: number | null;
  shares: number | null;
  publishedAt?: Date | null;
  previousSnapshots?: Array<{
    views: number | null;
    likes: number | null;
    replies: number | null;
    collectedAt: Date;
  }>;
}

export interface ScoreBreakdown {
  score: number;
  version: string;
  components: {
    reach: number;
    engagement: number;
    conversation: number;
    amplification: number;
    velocity: number;
  };
  explanation: string;
  isEligible: boolean;
  threshold: number;
}

export interface ScoringConfig {
  threshold?: number;
  reachMax?: number;
  engagementMax?: number;
  conversationMax?: number;
  amplificationMax?: number;
  velocityMax?: number;
}

export class MonetizationScoringService {
  readonly version = "v1";
  private defaultThreshold = 50;

  /**
   * Evaluates post engagement metrics using component-based v1 formula.
   * Never throws on zero/missing metrics.
   */
  evaluateScore(input: ScoringSignalInput, config?: ScoringConfig): ScoreBreakdown {
    const threshold = config?.threshold ?? this.defaultThreshold;

    const views = Math.max(0, input.views ?? 0);
    const likes = Math.max(0, input.likes ?? 0);
    const replies = Math.max(0, input.replies ?? 0);
    const reposts = Math.max(0, input.reposts ?? 0);
    const quotes = Math.max(0, input.quotes ?? 0);

    // 1. Reach Score (Max 30)
    // Uses logarithmic scale to avoid linear runaway on viral posts while rewarding initial discovery
    let reach = 0;
    if (views > 0) {
      reach = Math.min(30, Math.round(Math.log10(views + 1) * 10));
    }

    // 2. Engagement Score (Max 25)
    // Likes relative to views with base tier guarantees
    let engagement = 0;
    if (likes > 0) {
      const baseLikes = Math.min(15, likes * 2);
      const likeRate = views > 0 ? (likes / views) * 100 : 0;
      const rateBonus = Math.min(10, Math.round(likeRate * 2));
      engagement = Math.min(25, baseLikes + rateBonus);
    }

    // 3. Conversation Score (Max 25)
    // Direct community discussion is the strongest intent signal on Threads
    let conversation = 0;
    if (replies > 0) {
      const baseReplies = Math.min(15, replies * 3);
      const replyRate = views > 0 ? (replies / views) * 100 : 0;
      const conversationBonus = Math.min(10, Math.round(replyRate * 5));
      conversation = Math.min(25, baseReplies + conversationBonus);
    }

    // 4. Amplification Score (Max 10)
    // Reposts and quotes indicate shareability
    const amplification = Math.min(10, (reposts + quotes) * 2);

    // 5. Velocity Score (Max 10)
    // Evaluates rate of change from previous snapshots if available
    let velocity = 0;
    if (input.previousSnapshots && input.previousSnapshots.length > 0) {
      const latestPrev = input.previousSnapshots[0];
      const prevViews = Math.max(0, latestPrev.views ?? 0);
      const timeDiffHours = Math.max(0.1, (Date.now() - new Date(latestPrev.collectedAt).getTime()) / (1000 * 60 * 60));
      const viewsDelta = Math.max(0, views - prevViews);
      const viewsPerHour = viewsDelta / timeDiffHours;

      if (viewsPerHour >= 50) {
        velocity = 10;
      } else if (viewsPerHour >= 20) {
        velocity = 7;
      } else if (viewsPerHour >= 5) {
        velocity = 4;
      } else if (viewsPerHour > 0) {
        velocity = 2;
      }
    }

    const totalScore = Math.min(
      100,
      Math.max(0, reach + engagement + conversation + amplification + velocity)
    );

    const isEligible = totalScore >= threshold;

    const explanation = `Score: ${totalScore} (${this.version}) | Reach: +${reach}, Engagement: +${engagement}, Conversation: +${conversation}, Amplification: +${amplification}, Velocity: +${velocity} | Threshold: ${threshold} => ${
      isEligible ? "ELIGIBLE" : "WATCHING"
    }`;

    return {
      score: totalScore,
      version: this.version,
      components: {
        reach,
        engagement,
        conversation,
        amplification,
        velocity,
      },
      explanation,
      isEligible,
      threshold,
    };
  }
}

export const monetizationScoringService = new MonetizationScoringService();
