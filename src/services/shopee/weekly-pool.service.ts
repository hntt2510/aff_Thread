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
  WeeklyProductPoolItem,
} from "@/db/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { catalogScoringService } from "./catalog-scoring.service";

export interface PoolConfig {
  targetPoolSize?: number; // default 60
  minPoolSize?: number; // default 40
  maxPoolSize?: number; // default 100
  maxPerCategory?: number; // default 15
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

    // 2. Score all candidate products using CatalogScoringService
    const scoredCandidates = Array.from(productOfferMap.values()).map(({ product, offer }) => {
      const scoringResult = catalogScoringService.evaluate({
        commissionRate: offer?.commissionRate,
        commissionAmount: offer?.commissionAmount,
        soldCount: offer?.soldCount,
        capturedAt: offer?.capturedAt,
        lastSeenAt: product.lastSeenAt,
        category: product.category,
      });

      return {
        product,
        offer,
        catalogScore: scoringResult.score,
        reason: scoringResult.explanation,
        category: product.category || "General",
      };
    });

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

    const rowsToInsert = selected.map((item, idx) => ({
      weekStart: week,
      productId: item.product.id,
      offerId: item.offer?.id || null,
      rank: idx + 1,
      catalogScore: item.catalogScore,
      reasonJson: JSON.stringify({
        rank: idx + 1,
        explanation: item.reason,
        category: item.category,
      }),
      selectedAt: new Date(),
    }));

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

    return poolRows;
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
