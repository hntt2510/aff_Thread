import { db } from "@/db";
import {
  affiliateProducts,
  affiliateProductOffers,
  affiliatePerformanceSnapshots,
  productDealObservations,
  AffiliateProduct,
} from "@/db/schema";
import { eq, desc, and, ilike, sql } from "drizzle-orm";
import { normalizeVietnameseText } from "./relevance-evaluator.service";
import { getCurrentIsoWeek } from "./weekly-pool.service";

export interface ListProductsOptions {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
  activeOnly?: boolean;
}

export class ShopeeCatalogService {
  /**
   * Lists products with their latest offer snapshot and pagination.
   */
  async listProducts(options?: ListProductsOptions) {
    const page = Math.max(1, options?.page ?? 1);
    const limit = Math.min(100, Math.max(1, options?.limit ?? 20));
    const offset = (page - 1) * limit;

    const conditions = [];
    if (options?.activeOnly) {
      conditions.push(eq(affiliateProducts.isActive, true));
    }
    if (options?.category) {
      conditions.push(eq(affiliateProducts.category, options.category));
    }
    if (options?.search) {
      conditions.push(ilike(affiliateProducts.title, `%${options.search}%`));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const items = await db
      .select()
      .from(affiliateProducts)
      .where(whereClause)
      .orderBy(desc(affiliateProducts.lastSeenAt))
      .limit(limit)
      .offset(offset);

    const [totalRow] = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(affiliateProducts)
      .where(whereClause);

    // Fetch latest offer for each product
    const productIds = items.map((p) => p.id);
    let offersMap = new Map<string, typeof affiliateProductOffers.$inferSelect>();

    if (productIds.length > 0) {
      const allOffers = await db
        .select()
        .from(affiliateProductOffers)
        .where(eq(affiliateProductOffers.isActive, true))
        .orderBy(desc(affiliateProductOffers.capturedAt));

      for (const off of allOffers) {
        if (!offersMap.has(off.productId)) {
          offersMap.set(off.productId, off);
        }
      }
    }

    const enriched = items.map((prod) => ({
      ...prod,
      latestOffer: offersMap.get(prod.id) || null,
    }));

    return {
      products: enriched,
      total: totalRow?.count || 0,
      page,
      limit,
    };
  }

  /**
   * Retrieves full product detail including all historical weekly offer snapshots,
   * performance records, and past deal observations.
   */
  async getProductDetail(productId: string) {
    const [product] = await db
      .select()
      .from(affiliateProducts)
      .where(eq(affiliateProducts.id, productId))
      .limit(1);

    if (!product) return null;

    // Historical weekly offers (chronological order)
    const offers = await db
      .select()
      .from(affiliateProductOffers)
      .where(eq(affiliateProductOffers.productId, productId))
      .orderBy(desc(affiliateProductOffers.capturedAt));

    // Performance snapshots
    const performance = await db
      .select()
      .from(affiliatePerformanceSnapshots)
      .where(eq(affiliatePerformanceSnapshots.productId, productId))
      .orderBy(desc(affiliatePerformanceSnapshots.periodStart));

    // Deal observations
    const deals = await db
      .select()
      .from(productDealObservations)
      .where(eq(productDealObservations.productId, productId))
      .orderBy(desc(productDealObservations.observedAt));

    return {
      product,
      offers,
      performance,
      deals,
    };
  }

  /**
   * Creates a single product manually with initial offer snapshot.
   */
  async createManualProduct(data: {
    title: string;
    productUrl: string;
    affiliateUrl: string;
    category?: string;
    imageUrl?: string;
    commissionRate?: number;
    soldCount?: number;
    capturedWeek?: string;
  }) {
    const now = new Date();
    const normalizedTitle = normalizeVietnameseText(data.title);

    const [product] = await db
      .insert(affiliateProducts)
      .values({
        provider: "SHOPEE",
        title: data.title,
        normalizedTitle,
        category: data.category || null,
        productUrl: data.productUrl,
        imageUrl: data.imageUrl || null,
        currency: "VND",
        isActive: true,
        firstSeenAt: now,
        lastSeenAt: now,
      })
      .returning();

    const [offer] = await db
      .insert(affiliateProductOffers)
      .values({
        productId: product.id,
        capturedWeek: data.capturedWeek || getCurrentIsoWeek(now),
        capturedAt: now,
        affiliateUrl: data.affiliateUrl,
        commissionRate: data.commissionRate ? String(data.commissionRate) : null,
        soldCount: data.soldCount !== undefined ? data.soldCount : null,
        source: "MANUAL_ENTRY",
        isActive: true,
      })
      .returning();

    return { product, offer };
  }
}

export const shopeeCatalogService = new ShopeeCatalogService();
