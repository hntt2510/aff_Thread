/**
 * Provider-Neutral Catalog Scoring Engine.
 * Evaluates general affiliate product quality based on commission, popularity,
 * historical affiliate performance, and data freshness.
 * Uses logarithmic normalization to prevent extreme sold_count outliers from dominating.
 * Never conflates sold_count with conversion rate (CVR).
 */

export interface CatalogScoringInput {
  commissionRate?: number | string | null; // e.g. 0.15 for 15% or "0.15" or "15%"
  commissionAmount?: number | null; // in VND
  soldCount?: number | null;
  historicalClicks?: number | null;
  historicalOrders?: number | null;
  capturedAt?: Date | string | null;
  lastSeenAt?: Date | string | null;
  category?: string | null;
  hasVoucher?: boolean;
  voucherCode?: string | null;
}

export interface CatalogScoreBreakdown {
  score: number; // 0–100
  version: string;
  components: {
    commission: number; // Max 30
    popularity: number; // Max 35
    performance: number; // Max 20
    freshness: number; // Max 15
    voucherBonus?: number; // Max 10
  };
  signalsUsed: Record<string, any>;
  missingSignals: string[];
  explanation: string;
}

export interface CatalogScoringWeights {
  commissionMax?: number;
  popularityMax?: number;
  performanceMax?: number;
  freshnessMax?: number;
}

export class CatalogScoringService {
  readonly version = "v1.0.0-catalog";

  private parseCommissionRate(raw: number | string | null | undefined): number | null {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === "number") {
      // If already a ratio between 0 and 1, e.g. 0.15
      if (raw <= 1.0 && raw > 0) return raw;
      // If given as a percentage e.g. 15
      return raw / 100;
    }
    const cleanStr = String(raw).replace("%", "").trim();
    const num = parseFloat(cleanStr);
    if (isNaN(num) || num <= 0) return null;
    return num > 1.0 ? num / 100 : num;
  }

  evaluate(input: CatalogScoringInput, config?: CatalogScoringWeights): CatalogScoreBreakdown {
    const commissionMax = config?.commissionMax ?? 30;
    const popularityMax = config?.popularityMax ?? 35;
    const performanceMax = config?.performanceMax ?? 20;
    const freshnessMax = config?.freshnessMax ?? 15;

    const signalsUsed: Record<string, any> = {};
    const missingSignals: string[] = [];

    // 1. Commission Score (Max 30)
    // Benchmarks: 5% is base, 12% is great, 20%+ is top-tier
    let commissionScore = 0;
    const rate = this.parseCommissionRate(input.commissionRate);

    if (rate !== null) {
      signalsUsed.commissionRate = `${(rate * 100).toFixed(1)}%`;
      if (rate >= 0.20) {
        commissionScore = commissionMax; // 30
      } else if (rate >= 0.15) {
        commissionScore = Math.round(commissionMax * 0.85); // 26
      } else if (rate >= 0.10) {
        commissionScore = Math.round(commissionMax * 0.65); // 20
      } else if (rate >= 0.05) {
        commissionScore = Math.round(commissionMax * 0.40); // 12
      } else {
        commissionScore = Math.round(commissionMax * 0.20); // 6
      }

      // Bonus if absolute commission amount is known and high (> 50,000 VND)
      if (input.commissionAmount && input.commissionAmount >= 50000) {
        signalsUsed.commissionAmount = input.commissionAmount;
        commissionScore = Math.min(commissionMax, commissionScore + 3);
      }
    } else {
      missingSignals.push("commissionRate");
    }

    // 2. Popularity / Sold Count Score (Max 35)
    // Uses logarithmic scaling: log10(sold + 1) / log10(10000 + 1) * 35
    let popularityScore = 0;
    if (input.soldCount !== null && input.soldCount !== undefined && input.soldCount >= 0) {
      const sold = Math.max(0, input.soldCount);
      signalsUsed.soldCount = sold;
      if (sold > 0) {
        // Benchmark: 10,000 sold reaches max popularity points
        const logSold = Math.log10(sold + 1);
        const logMax = Math.log10(10001); // ~4.00
        const ratio = Math.min(1.0, logSold / logMax);
        popularityScore = Math.round(ratio * popularityMax);
      }
    } else {
      missingSignals.push("soldCount");
    }

    // 3. Historical Affiliate Performance (Max 20)
    // Requires both clicks and orders to evaluate actual conversion indicators
    let performanceScore = 0;
    const hasClicks = typeof input.historicalClicks === "number" && input.historicalClicks > 0;
    const hasOrders = typeof input.historicalOrders === "number" && input.historicalOrders >= 0;

    if (hasClicks && hasOrders && input.historicalClicks! >= 10) {
      const cvr = (input.historicalOrders! / input.historicalClicks!) * 100;
      signalsUsed.affiliateCvr = `${cvr.toFixed(2)}% (${input.historicalOrders}/${input.historicalClicks})`;

      if (cvr >= 8.0) {
        performanceScore = performanceMax; // 20
      } else if (cvr >= 5.0) {
        performanceScore = Math.round(performanceMax * 0.75); // 15
      } else if (cvr >= 2.0) {
        performanceScore = Math.round(performanceMax * 0.50); // 10
      } else if (cvr > 0) {
        performanceScore = Math.round(performanceMax * 0.25); // 5
      }
    } else {
      missingSignals.push("historicalAffiliatePerformance");
      // Fallback: If sold count is established (> 500) and no historical performance exists yet,
      // grant a baseline reliability score so new products can enter pool
      if (input.soldCount && input.soldCount >= 500) {
        performanceScore = 5;
      }
    }

    // 4. Data Freshness (Max 15)
    // Evaluates how recently the offer was observed/verified
    let freshnessScore = 0;
    const capturedTime = input.capturedAt || input.lastSeenAt;

    if (capturedTime) {
      const date = new Date(capturedTime);
      const ageHours = Math.max(0, (Date.now() - date.getTime()) / (1000 * 60 * 60));
      signalsUsed.ageHours = Math.round(ageHours);

      if (ageHours <= 24) {
        freshnessScore = freshnessMax; // 15
      } else if (ageHours <= 72) {
        freshnessScore = Math.round(freshnessMax * 0.80); // 12
      } else if (ageHours <= 168) { // 7 days
        freshnessScore = Math.round(freshnessMax * 0.50); // 8
      } else {
        freshnessScore = Math.round(freshnessMax * 0.20); // 3
      }
    } else {
      missingSignals.push("freshness");
    }

    // 5. Voucher Prioritization Boost (Max +10)
    // Boost product score if a valid voucher exists
    let voucherBonus = 0;
    const hasValidVoucher = Boolean(
      input.hasVoucher || (input.voucherCode && String(input.voucherCode).trim().length > 0)
    );
    if (hasValidVoucher) {
      voucherBonus = 10;
      signalsUsed.voucherPrioritized = true;
      if (input.voucherCode) {
        signalsUsed.voucherCode = String(input.voucherCode).trim();
      }
    }

    const totalScore = Math.min(
      100,
      Math.max(0, commissionScore + popularityScore + performanceScore + freshnessScore + voucherBonus)
    );

    const explanation = `Catalog Score: ${totalScore}/100 | Commission: +${commissionScore}, Popularity: +${popularityScore}, Historical Perf: +${performanceScore}, Freshness: +${freshnessScore}${
      voucherBonus > 0 ? `, Voucher Boost: +${voucherBonus}` : ""
    }${
      missingSignals.length > 0 ? ` (Missing: ${missingSignals.join(", ")})` : ""
    }`;

    return {
      score: totalScore,
      version: this.version,
      components: {
        commission: commissionScore,
        popularity: popularityScore,
        performance: performanceScore,
        freshness: freshnessScore,
        voucherBonus,
      },
      signalsUsed,
      missingSignals,
      explanation,
    };
  }
}

export const catalogScoringService = new CatalogScoringService();
