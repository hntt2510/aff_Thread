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

export interface ScoreComponentResult {
  score: number;
  maxScore: number;
  explanation: string;
  signalsUsed: Record<string, any>;
  missingSignals?: string[];
}

export interface ScoreComponent<TContext> {
  id: string;
  version: string;
  calculate(context: TContext): ScoreComponentResult;
}

export class ReachScoreComponent implements ScoreComponent<ScoringSignalInput> {
  readonly id = "reach";
  readonly version = "v1";

  calculate(input: ScoringSignalInput): ScoreComponentResult {
    const views = Math.max(0, input.views ?? 0);
    let reach = 0;
    if (views > 0) {
      reach = Math.min(30, Math.round(Math.log10(views + 1) * 10));
    }
    return {
      score: reach,
      maxScore: 30,
      explanation: `Logarithmic reach from ${views} views`,
      signalsUsed: { views },
      missingSignals: input.views === null ? ["views"] : undefined,
    };
  }
}

export class EngagementScoreComponent implements ScoreComponent<ScoringSignalInput> {
  readonly id = "engagement";
  readonly version = "v1";

  calculate(input: ScoringSignalInput): ScoreComponentResult {
    const views = Math.max(0, input.views ?? 0);
    const likes = Math.max(0, input.likes ?? 0);
    let engagement = 0;
    if (likes > 0) {
      const baseLikes = Math.min(15, likes * 2);
      const likeRate = views > 0 ? (likes / views) * 100 : 0;
      const rateBonus = Math.min(10, Math.round(likeRate * 2));
      engagement = Math.min(25, baseLikes + rateBonus);
    }
    return {
      score: engagement,
      maxScore: 25,
      explanation: `Likes (${likes}) ratio relative to views (${views})`,
      signalsUsed: { likes, views },
      missingSignals: input.likes === null ? ["likes"] : undefined,
    };
  }
}

export class ConversationScoreComponent implements ScoreComponent<ScoringSignalInput> {
  readonly id = "conversation";
  readonly version = "v1";

  calculate(input: ScoringSignalInput): ScoreComponentResult {
    const views = Math.max(0, input.views ?? 0);
    const replies = Math.max(0, input.replies ?? 0);
    let conversation = 0;
    if (replies > 0) {
      const baseReplies = Math.min(15, replies * 3);
      const replyRate = views > 0 ? (replies / views) * 100 : 0;
      const conversationBonus = Math.min(10, Math.round(replyRate * 5));
      conversation = Math.min(25, baseReplies + conversationBonus);
    }
    return {
      score: conversation,
      maxScore: 25,
      explanation: `Reply intensity (${replies}) on views (${views})`,
      signalsUsed: { replies, views },
      missingSignals: input.replies === null ? ["replies"] : undefined,
    };
  }
}

export class AmplificationScoreComponent implements ScoreComponent<ScoringSignalInput> {
  readonly id = "amplification";
  readonly version = "v1";

  calculate(input: ScoringSignalInput): ScoreComponentResult {
    const reposts = Math.max(0, input.reposts ?? 0);
    const quotes = Math.max(0, input.quotes ?? 0);
    const amplification = Math.min(10, (reposts + quotes) * 2);
    return {
      score: amplification,
      maxScore: 10,
      explanation: `Reposts (${reposts}) + Quotes (${quotes})`,
      signalsUsed: { reposts, quotes },
      missingSignals: [
        ...(input.reposts === null ? ["reposts"] : []),
        ...(input.quotes === null ? ["quotes"] : []),
      ],
    };
  }
}

export class VelocityScoreComponent implements ScoreComponent<ScoringSignalInput> {
  readonly id = "velocity";
  readonly version = "v1";

  calculate(input: ScoringSignalInput): ScoreComponentResult {
    const views = Math.max(0, input.views ?? 0);
    let velocity = 0;
    const hasHistory = Boolean(input.previousSnapshots && input.previousSnapshots.length > 0);

    if (hasHistory && input.previousSnapshots) {
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

    return {
      score: velocity,
      maxScore: 10,
      explanation: hasHistory ? `View velocity over previous snapshot` : "No prior snapshot history",
      signalsUsed: { views, hasHistory },
      missingSignals: hasHistory ? undefined : ["previousSnapshots"],
    };
  }
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
    [key: string]: number;
  };
  componentDetails?: Record<string, ScoreComponentResult>;
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
  private components: Map<string, ScoreComponent<ScoringSignalInput>> = new Map();

  constructor() {
    this.registerComponent(new ReachScoreComponent());
    this.registerComponent(new EngagementScoreComponent());
    this.registerComponent(new ConversationScoreComponent());
    this.registerComponent(new AmplificationScoreComponent());
    this.registerComponent(new VelocityScoreComponent());
  }

  /**
   * Registers a new or custom scoring component.
   */
  registerComponent(component: ScoreComponent<ScoringSignalInput>): void {
    this.components.set(component.id, component);
  }

  /**
   * Evaluates post engagement metrics using component-based v1 formula.
   * Never throws on zero/missing metrics.
   */
  evaluateScore(input: ScoringSignalInput, config?: ScoringConfig): ScoreBreakdown {
    const threshold = config?.threshold ?? this.defaultThreshold;
    const details: Record<string, ScoreComponentResult> = {};
    const components: Record<string, number> = {
      reach: 0,
      engagement: 0,
      conversation: 0,
      amplification: 0,
      velocity: 0,
    };

    let totalScore = 0;

    for (const [id, component] of this.components.entries()) {
      const result = component.calculate(input);
      details[id] = result;
      components[id] = result.score;
      totalScore += result.score;
    }

    const clampedTotal = Math.min(100, Math.max(0, totalScore));
    const isEligible = clampedTotal >= threshold;

    const reach = components.reach ?? 0;
    const engagement = components.engagement ?? 0;
    const conversation = components.conversation ?? 0;
    const amplification = components.amplification ?? 0;
    const velocity = components.velocity ?? 0;

    const explanation = `Score: ${clampedTotal} (${this.version}) | Reach: +${reach}, Engagement: +${engagement}, Conversation: +${conversation}, Amplification: +${amplification}, Velocity: +${velocity} | Threshold: ${threshold} => ${
      isEligible ? "ELIGIBLE" : "WATCHING"
    }`;

    return {
      score: clampedTotal,
      version: this.version,
      components: {
        reach,
        engagement,
        conversation,
        amplification,
        velocity,
      },
      componentDetails: details,
      explanation,
      isEligible,
      threshold,
    };
  }
}

export const monetizationScoringService = new MonetizationScoringService();
