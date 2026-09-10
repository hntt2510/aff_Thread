/**
 * Weekly Product Pool Service.
 * Manages the selection and persistence of the top ~50–70 curated candidate products per week.
 * Enforces category diversity caps, retains historical pools, and avoids overwriting previous weeks.
 */

import { db } from "@/db";
import {
  weeklyProductPool,
  affiliateProducts,
  affiliateProductOffers,
  productDealObservations,
  WeeklyProductPoolItem,
} from "@/db/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { catalogScoringService } from "./catalog-scoring.service";
import { extractAndCalculateShopeeDeal } from "./automated-deal-pipeline";

export interface PoolConfig {
  targetPoolSize?: number; // default 60
  minPoolSize?: number; // default 40
  maxPoolSize?: number; // default 100
  maxPerCategory?: number; // default 15
  enforceDynamicRating?: boolean; // default true
}

export interface DynamicRatingFilterInput {
  isOfficialShop?: boolean | null;
  totalRatings?: number | null;
  ratingStar?: number | null;
  historicalSold?: number | null;
  stock?: number | null;
}

export interface DynamicRatingEligibilityResult {
  isEligible: boolean;
  reason?: string;
}

/**
 * Evaluates product eligibility against dynamic rating and volume thresholds:
 * - Drops products with historical_sold < 50 or stock <= 0.
 * - If is_official_shop == true (Shopee Mall) AND total_ratings >= 50: Accept rating_star >= 4.5.
 * - Otherwise: Strictly require rating_star >= 4.6.
 */
export function evaluateDynamicRatingEligibility(
  input: DynamicRatingFilterInput
): DynamicRatingEligibilityResult {
  const sold = input.historicalSold ?? 0;
  if (sold < 50) {
    return {
      isEligible: false,
      reason: `Historical sold (${sold}) < 50 minimum threshold`,
    };
  }

  // Stock check: if stock is explicitly provided and <= 0, drop product
  if (input.stock !== undefined && input.stock !== null && input.stock <= 0) {
    return {
      isEligible: false,
      reason: `Product stock (${input.stock}) <= 0 (out of stock)`,
    };
  }

  const rating = input.ratingStar ?? 0;
  const isOfficial = Boolean(input.isOfficialShop);
  const totalRatings = input.totalRatings ?? 0;

  // Shopee Mall / Official Shop with >= 50 total reviews accepts rating >= 4.5
  if (isOfficial && totalRatings >= 50) {
    if (rating < 4.5) {
      return {
        isEligible: false,
        reason: `Shopee Mall product rating (${rating}) < 4.5 threshold`,
      };
    }
  } else {
    // All other sellers strictly require rating >= 4.6
    if (rating < 4.6) {
      return {
        isEligible: false,
        reason: `Standard product rating (${rating}) < 4.6 strict threshold`,
      };
    }
  }

  return { isEligible: true };
}

/**
 * Returns current ISO week format: e.g. "2026-W37"
 */
export function getCurrentIsoWeek(date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

export class WeeklyPoolService {
  /**
   * Generates or refreshes the weekly product pool for a given week.
   * Selection is idempotent: existing entries for the week are safely updated or refreshed.
   */
  async generateWeeklyPool(week = getCurrentIsoWeek(), config?: PoolConfig): Promise<WeeklyProductPoolItem[]> {
    const targetSize = config?.targetPoolSize ?? 60;
    const maxPerCat = config?.maxPerCategory ?? 15;

    // 1. Fetch active products with their latest offers
    const products = await db
      .select({
        product: affiliateProducts,
        offer: affiliateProductOffers,
      })
      .from(affiliateProducts)
      .leftJoin(
        affiliateProductOffers,
        and(
          eq(affiliateProductOffers.productId, affiliateProducts.id),
          eq(affiliateProductOffers.isActive, true)
        )
      )
      .where(eq(affiliateProducts.isActive, true))
      .orderBy(desc(affiliateProducts.lastSeenAt));

    // Deduplicate products to latest offer
    const productOfferMap = new Map<string, { product: typeof affiliateProducts.$inferSelect; offer: typeof affiliateProductOffers.$inferSelect | null }>();
    for (const row of products) {
      if (!productOfferMap.has(row.product.id)) {
        productOfferMap.set(row.product.id, row);
      }
    }

    // 2. Score and filter all candidate products using Dynamic Rating and CatalogScoringService
    const enforceRating = config?.enforceDynamicRating ?? true;
    const scoredCandidates: Array<{
      product: typeof affiliateProducts.$inferSelect;
      offer: typeof affiliateProductOffers.$inferSelect | null;
      catalogScore: number;
      reason: string;
      category: string;
    }> = [];

    for (const { product, offer } of productOfferMap.values()) {
      let meta: any = {};
      if (offer?.sourceMetadataJson) {
        try {
          meta = JSON.parse(offer.sourceMetadataJson);
        } catch {
          // ignore
        }
      }

      const isOfficialShop = Boolean(
        meta.isOfficialShop ??
        meta.is_official_shop ??
        (/official|flagship|shopee\s*mall|mall/i.test(product.category || "") ||
         /official|flagship|shopee\s*mall|mall/i.test(meta.shopName || ""))
      );
      const totalRatings = Number(meta.totalRatings ?? meta.total_ratings ?? meta.ratingCount ?? 0);
      const ratingStar = Number(meta.rating ?? meta.ratingStar ?? 5);
      const soldCount = offer?.soldCount ?? Number(meta.soldCount ?? meta.historicalSold ?? 0);
      const stock = meta.stock !== undefined ? Number(meta.stock) : 999;

      const hasVoucher = Boolean(
        meta.voucherCode ||
        meta.voucher_code ||
        meta.voucherInfo?.voucher_code ||
        meta.voucher_info?.voucher_code ||
        meta.voucherInfo?.code
      );
      const voucherCode =
        meta.voucherCode ||
        meta.voucher_code ||
        meta.voucherInfo?.voucher_code ||
        meta.voucher_info?.voucher_code ||
        meta.voucherInfo?.code ||
        null;

      // Apply Dynamic Rating & Stock/Sold Filter if enabled
      if (enforceRating) {
        const eligibility = evaluateDynamicRatingEligibility({
          isOfficialShop,
          totalRatings,
          ratingStar,
          historicalSold: soldCount,
          stock,
        });

        if (!eligibility.isEligible) {
          continue; // Disqualify product from weekly pool
        }
      }

      const scoringResult = catalogScoringService.evaluate({
        commissionRate: offer?.commissionRate,
        commissionAmount: offer?.commissionAmount,
        soldCount,
        capturedAt: offer?.capturedAt,
        lastSeenAt: product.lastSeenAt,
        category: product.category,
        hasVoucher,
        voucherCode,
      });

      scoredCandidates.push({
        product,
        offer,
        catalogScore: scoringResult.score,
        reason: scoringResult.explanation,
        category: product.category || "General",
      });
    }

    // Sort descending by catalog score
    scoredCandidates.sort((a, b) => b.catalogScore - a.catalogScore);

    // 3. Apply category diversity caps
    const selected: typeof scoredCandidates = [];
    const categoryCounts = new Map<string, number>();

    // Pass 1: Select up to maxPerCategory per category until targetSize
    for (const cand of scoredCandidates) {
      if (selected.length >= targetSize) break;
      const count = categoryCounts.get(cand.category) || 0;
      if (count < maxPerCat) {
        selected.push(cand);
        categoryCounts.set(cand.category, count + 1);
      }
    }

    // Pass 2: If pool size is still below min target and more candidates exist, fill remaining slots
    if (selected.length < targetSize) {
      for (const cand of scoredCandidates) {
        if (selected.length >= targetSize) break;
        if (!selected.includes(cand)) {
          selected.push(cand);
        }
      }
    }

    // 4. Persist to weekly_product_pool table (idempotent: delete existing for this week and insert newly ranked)
    await db.delete(weeklyProductPool).where(eq(weeklyProductPool.weekStart, week));

    if (selected.length === 0) {
      return [];
    }

    const rowsToInsert = await Promise.all(
      selected.map(async (item, idx) => {
        let meta: any = {};
        if (item.offer?.sourceMetadataJson) {
          try {
            meta = JSON.parse(item.offer.sourceMetadataJson);
          } catch {
            // ignore
          }
        }

        let dealCalculation = meta.calculation;
        let estimatedFinalPrice = meta.estimatedFinalPrice;
        let dealOpportunity = meta.dealOpportunity || { score: meta.dealOpportunityScore ?? 50 };

        if (!dealCalculation) {
          const dealFacts = extractAndCalculateShopeeDeal({
            price: meta.price ?? meta.observedPrice,
            priceBeforeDiscount: meta.originalPrice,
            voucherInfo: meta.voucherInfo,
            voucherCode: meta.voucherCode,
            commissionRate: item.offer?.commissionRate,
          });
          dealCalculation = dealFacts.calculation;
          estimatedFinalPrice = dealFacts.estimatedFinalPrice;
          dealOpportunity = dealFacts.dealOpportunity;
        }

        // Ensure product_deal_observations has observation for each pool item
        const [existingObs] = await db
          .select()
          .from(productDealObservations)
          .where(eq(productDealObservations.productId, item.product.id))
          .limit(1);

        if (!existingObs && dealCalculation) {
          await db.insert(productDealObservations).values({
            productId: item.product.id,
            offerId: item.offer?.id || null,
            observedAt: new Date(),
            observedPrice: dealCalculation.basePrice,
            originalPrice: dealCalculation.evidence?.originalPrice || dealCalculation.basePrice,
            currency: "VND",
            voucherCode: dealCalculation.evidence?.voucherCode || null,
            voucherDiscountType: dealCalculation.evidence?.voucherDiscountType || null,
            voucherDiscountPercent: dealCalculation.evidence?.voucherDiscountPercent
              ? String(dealCalculation.evidence.voucherDiscountPercent)
              : null,
            voucherDiscountAmount: dealCalculation.evidence?.voucherDiscountAmount || null,
            voucherMaxDiscount: dealCalculation.evidence?.voucherMaxDiscount || null,
            voucherMinSpend: dealCalculation.evidence?.voucherMinSpend || null,
            source: "SHOPEE_POOL_AUTO",
            confidence: "1.00",
            rawMetadataJson: JSON.stringify({
              calculation: dealCalculation,
              dealOpportunity,
              estimatedFinalPrice,
            }),
          });
        }

        return {
          weekStart: week,
          productId: item.product.id,
          offerId: item.offer?.id || null,
          rank: idx + 1,
          catalogScore: item.catalogScore,
          reasonJson: JSON.stringify({
            rank: idx + 1,
            explanation: item.reason,
            category: item.category,
            calculation: dealCalculation,
            dealOpportunity,
            estimatedFinalPrice,
          }),
          selectedAt: new Date(),
        };
      })
    );

    const inserted = await db.insert(weeklyProductPool).values(rowsToInsert).returning();
    return inserted;
  }

  /**
   * Retrieves the product pool for a specified week (defaults to current week).
   */
  async getPoolForWeek(week = getCurrentIsoWeek()) {
    const poolRows = await db
      .select({
        poolItem: weeklyProductPool,
        product: affiliateProducts,
        offer: affiliateProductOffers,
      })
      .from(weeklyProductPool)
      .innerJoin(affiliateProducts, eq(weeklyProductPool.productId, affiliateProducts.id))
      .leftJoin(affiliateProductOffers, eq(weeklyProductPool.offerId, affiliateProductOffers.id))
      .where(eq(weeklyProductPool.weekStart, week))
      .orderBy(weeklyProductPool.rank);

    return poolRows.map((row) => {
      let dealCalculation: any = null;
      let estimatedFinalPrice: number | null = null;
      let dealOpportunityScore: number = 50;

      if (row.poolItem.reasonJson) {
        try {
          const reason = JSON.parse(row.poolItem.reasonJson);
          if (reason.calculation) {
            dealCalculation = reason.calculation;
            estimatedFinalPrice = reason.estimatedFinalPrice ?? reason.calculation.estimatedFinalPrice;
            dealOpportunityScore = reason.dealOpportunity?.score ?? 50;
          }
        } catch {
          // ignore
        }
      }

      if (!dealCalculation && row.offer?.sourceMetadataJson) {
        try {
          const meta = JSON.parse(row.offer.sourceMetadataJson);
          if (meta.calculation) {
            dealCalculation = meta.calculation;
            estimatedFinalPrice = meta.estimatedFinalPrice ?? meta.calculation.estimatedFinalPrice;
            dealOpportunityScore = meta.dealOpportunityScore ?? 50;
          }
        } catch {
          // ignore
        }
      }

      return {
        ...row,
        dealCalculation,
        estimatedFinalPrice,
        dealOpportunityScore,
      };
    });
  }

  /**
   * Lists distinct available historical weeks.
   */
  async listAvailableWeeks(): Promise<string[]> {
    const rows = await db
      .selectDistinct({ weekStart: weeklyProductPool.weekStart })
      .from(weeklyProductPool)
      .orderBy(desc(weeklyProductPool.weekStart));

    return rows.map((r) => r.weekStart);
  }
}

export const weeklyPoolService = new WeeklyPoolService();
