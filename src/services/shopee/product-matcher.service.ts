/**
 * Multi-Criteria Product Matcher.
 * Combines independent signals (Relevance, Catalog Quality, Deal Opportunity, Affiliate Performance)
 * to rank candidate products for an eligible Threads post.
 */

import { ProductRelevanceEvaluator, deterministicRelevanceEvaluator } from "./relevance-evaluator.service";
import { CatalogScoreBreakdown } from "./catalog-scoring.service";
import { DealOpportunityBreakdown } from "./deal-opportunity-scoring.service";
import { FinalPriceCalculationResult } from "./final-price-calculator";

export interface MatcherCandidateItem {
  id: string; // product id
  title: string;
  category?: string | null;
  productUrl: string;
  affiliateUrl: string;
  imageUrl?: string | null;
  catalogScore: number;
  catalogBreakdown?: CatalogScoreBreakdown;
  dealOpportunityScore?: number;
  dealOpportunityBreakdown?: DealOpportunityBreakdown;
  dealCalculation?: FinalPriceCalculationResult;
  performanceScore?: number;
  voucherCode?: string | null;
  discountRate?: number | null;
}

export interface MatcherWeights {
  relevanceWeight?: number; // default 0.35
  catalogWeight?: number; // default 0.25
  dealWeight?: number; // default 0.30
  performanceWeight?: number; // default 0.10
}

export interface RankedProductMatch {
  product: MatcherCandidateItem;
  totalMatchScore: number; // 0–100
  rank: number;
  components: {
    relevance: number;
    catalog: number;
    deal: number;
    performance: number;
  };
  matchedKeywords: string[];
  explanation: string;
  isFallback?: boolean;
}

export interface ProductMatcherOptions {
  topN?: number; // default 3
  weights?: MatcherWeights;
  minMatchScore?: number; // default 30
  relevanceEvaluator?: ProductRelevanceEvaluator;
  disableFallback?: boolean;
}

export class ProductMatcherService {
  private defaultWeights: Required<MatcherWeights> = {
    relevanceWeight: 0.35,
    catalogWeight: 0.25,
    dealWeight: 0.30,
    performanceWeight: 0.10,
  };

  /**
   * Matches and ranks candidates against a Threads post context.
   * If no direct keyword or category match is found, falls back to Top 1 highest-scoring deal in pool.
   */
  rankCandidates(
    postText: string,
    candidates: MatcherCandidateItem[],
    options?: ProductMatcherOptions
  ): RankedProductMatch[] {
    const weights = { ...this.defaultWeights, ...options?.weights };
    const evaluator = options?.relevanceEvaluator ?? deterministicRelevanceEvaluator;
    const topN = options?.topN ?? 3;
    const minScore = options?.minMatchScore ?? 0;

    const scoredItems = candidates.map((item) => {
      // 1. Relevance Score (0–100)
      const relResult = evaluator.evaluate({ postText }, {
        id: item.id,
        title: item.title,
        category: item.category,
      });
      const relevanceScore = relResult.score;
      const hasDirectMatch = relResult.matchedKeywords.length > 0 || relResult.categoryMatch;

      // 2. Catalog Score (0–100)
      const catalogScore = Math.min(100, Math.max(0, item.catalogScore ?? 50));

      // 3. Deal Opportunity Score (0–100)
      const dealScore = Math.min(100, Math.max(0, item.dealOpportunityScore ?? 50));

      // 4. Performance Score (0–100)
      const performanceScore = Math.min(100, Math.max(0, item.performanceScore ?? 50));

      // Weighted combination
      const totalScore = Math.round(
        relevanceScore * weights.relevanceWeight +
        catalogScore * weights.catalogWeight +
        dealScore * weights.dealWeight +
        performanceScore * weights.performanceWeight
      );

      const explanation = `Match: ${totalScore}/100 | Rel: ${relevanceScore} (w:${weights.relevanceWeight}), Cat: ${catalogScore} (w:${weights.catalogWeight}), Deal: ${dealScore} (w:${weights.dealWeight}), Perf: ${performanceScore} (w:${weights.performanceWeight})`;

      return {
        product: item,
        totalMatchScore: totalScore,
        components: {
          relevance: relevanceScore,
          catalog: catalogScore,
          deal: dealScore,
          performance: performanceScore,
        },
        matchedKeywords: relResult.matchedKeywords,
        hasDirectMatch,
        explanation,
      };
    });

    const hasAnyDirectMatch = scoredItems.some((i) => i.hasDirectMatch);

    if (hasAnyDirectMatch) {
      // Direct matches found: sort descending and filter by min score
      scoredItems.sort((a, b) => b.totalMatchScore - a.totalMatchScore);
      const filtered = scoredItems.filter((i) => i.totalMatchScore >= minScore);

      return filtered.slice(0, topN).map((item, idx) => ({
        product: item.product,
        totalMatchScore: item.totalMatchScore,
        rank: idx + 1,
        components: item.components,
        matchedKeywords: item.matchedKeywords,
        explanation: item.explanation,
        isFallback: false,
      }));
    }

    // No direct keyword or category match found: Fallback to Top 1 highest-scoring deal in current Pool
    if (candidates.length === 0 || options?.disableFallback) {
      return [];
    }

    const bestDeal = [...candidates].sort((a, b) => {
      const scoreA = (a.dealOpportunityScore ?? 50) * 0.6 + (a.catalogScore ?? 50) * 0.4;
      const scoreB = (b.dealOpportunityScore ?? 50) * 0.6 + (b.catalogScore ?? 50) * 0.4;
      return scoreB - scoreA;
    })[0];

    const fallbackScore = Math.round(
      (bestDeal.dealOpportunityScore ?? 50) * 0.6 + (bestDeal.catalogScore ?? 50) * 0.4
    );

    return [
      {
        product: bestDeal,
        totalMatchScore: fallbackScore,
        rank: 1,
        isFallback: true,
        components: {
          relevance: 0,
          catalog: bestDeal.catalogScore ?? 50,
          deal: bestDeal.dealOpportunityScore ?? 50,
          performance: bestDeal.performanceScore ?? 50,
        },
        matchedKeywords: [],
        explanation: "No direct keyword or category match found in post content. Fallback to Top 1 highest-scoring deal in current pool.",
      },
    ];
  }
}

export const productMatcherService = new ProductMatcherService();
