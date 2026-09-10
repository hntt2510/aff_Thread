import { db } from "@/db";
import {
  affiliateProducts,
  affiliateProductOffers,
  productDealObservations,
} from "@/db/schema";
import { eq, desc, asc, and, ilike, gte, lte, sql } from "drizzle-orm";
import { normalizeVietnameseText } from "./relevance-evaluator.service";
import { getCurrentIsoWeek } from "./weekly-pool.service";

export interface RawShopeeProductItem {
  item_id?: string;
  long_link?: string;
  product_link?: string;
  default_commission_rate?: string;
  seller_commission_rate?: string;
  batch_item_for_item_card_full?: {
    itemid?: string;
    name?: string;
    price?: string | number;
    price_before_discount?: string | number;
    discount?: string;
    image?: string;
    historical_sold_text?: string;
    shop_name?: string;
    item_rating?: { rating_star?: number };
  };
}

export interface MappedShopeeOffer {
  itemId: string;
  title: string;
  price: number;
  originalPrice: number;
  discount: string;
  rate: number;
  sellerRate: number;
  imageUrl: string;
  affUrl: string;
  sold: string;
  soldCount: number;
  rating: number;
  shopName: string;
}

export interface TopOffersFilter {
  search?: string;
  minPrice?: number;
  maxPrice?: number;
  minRate?: number;
  sortBy?: "rate_desc" | "rate_asc" | "price_asc" | "price_desc" | "sold_desc";
  page?: number;
  limit?: number;
}

export class ShopeeTopOffersService {
  /**
   * Transforms a single raw Shopee REST API item into normalized MappedShopeeOffer
   */
  transformShopeeOffer(item: RawShopeeProductItem): MappedShopeeOffer {
    const card = item.batch_item_for_item_card_full || {};

    const rawId = item.item_id || card.itemid || "";
    const itemId = String(rawId).trim();
    const title = String(card.name || "").trim() || `Sản phẩm #${itemId}`;

    // Price conversion: Shopee micro-currency / 100000
    // Example: "9520000000" -> 95200 VND
    const rawPrice = Number(card.price || 0);
    const price = rawPrice > 0 ? Math.round(rawPrice / 100000) : 0;

    const rawOriginalPrice = Number(card.price_before_discount || 0);
    const originalPrice = rawOriginalPrice > 0 ? Math.round(rawOriginalPrice / 100000) : price;

    const discount = String(card.discount || "").trim();

    // Rate parsing: "21,5%" -> 21.5
    const rawRateStr = String(item.default_commission_rate || "0")
      .replace("%", "")
      .replace(",", ".")
      .trim();
    const rate = Math.round((parseFloat(rawRateStr) || 0) * 100) / 100;

    const rawSellerRateStr = String(item.seller_commission_rate || "0")
      .replace("%", "")
      .replace(",", ".")
      .trim();
    const sellerRate = Math.round((parseFloat(rawSellerRateStr) || 0) * 100) / 100;

    // Image URL via Shopee CDN
    const imageCode = String(card.image || "").trim();
    const imageUrl = imageCode
      ? `https://down-vn.img.susercontent.com/file/${imageCode}`
      : "";

    // Affiliate/Product Link
    const affUrl = String(item.long_link || item.product_link || "").trim();

    const sold = String(card.historical_sold_text || "0").trim();
    const soldCount = this.parseSoldCount(sold);

    const rating = Number(card.item_rating?.rating_star) || 5;
    const shopName = String(card.shop_name || "").trim();

    return {
      itemId,
      title,
      price,
      originalPrice,
      discount,
      rate,
      sellerRate,
      imageUrl,
      affUrl,
      sold,
      soldCount,
      rating,
      shopName,
    };
  }

  /**
   * Parses historical sold text (e.g. "51", "1,2k", "10.5k") to numeric integer
   */
  private parseSoldCount(soldText: string): number {
    if (!soldText) return 0;
    const clean = soldText.toLowerCase().replace(/\s+/g, "");
    if (clean.includes("k")) {
      const num = parseFloat(clean.replace("k", "").replace(",", "."));
      return isNaN(num) ? 0 : Math.round(num * 1000);
    }
    const num = parseInt(clean.replace(/[^0-9]/g, ""), 10);
    return isNaN(num) ? 0 : num;
  }

  /**
   * Filters out items without commission (rate <= 0) and sorts by rate descending
   */
  filterAndSortOffers(rawList: RawShopeeProductItem[]): MappedShopeeOffer[] {
    if (!Array.isArray(rawList)) return [];

    return rawList
      .map((item) => this.transformShopeeOffer(item))
      .filter((offer) => offer.itemId && offer.title && offer.rate > 0)
      .sort((a, b) => b.rate - a.rate);
  }

  /**
   * Upserts mapped offers into the database (affiliate_products, affiliate_product_offers, product_deal_observations)
   */
  async upsertTopOffers(offers: MappedShopeeOffer[], week?: string): Promise<{
    totalReceived: number;
    upsertedProducts: number;
    createdOffers: number;
    createdObservations: number;
  }> {
    const now = new Date();
    const currentWeek = week || getCurrentIsoWeek(now);

    let upsertedProducts = 0;
    let createdOffers = 0;
    let createdObservations = 0;

    for (const offer of offers) {
      if (!offer.itemId || !offer.title) continue;

      const normalized = normalizeVietnameseText(offer.title);

      // 1. Upsert product
      const existingProducts = await db
        .select({ id: affiliateProducts.id })
        .from(affiliateProducts)
        .where(
          and(
            eq(affiliateProducts.provider, "SHOPEE"),
            eq(affiliateProducts.externalProductId, offer.itemId)
          )
        )
        .limit(1);

      let productId: string;

      if (existingProducts.length > 0) {
        productId = existingProducts[0].id;
        await db
          .update(affiliateProducts)
          .set({
            title: offer.title,
            normalizedTitle: normalized,
            category: offer.shopName || "Shopee Top Offer",
            productUrl: offer.affUrl || undefined,
            imageUrl: offer.imageUrl || undefined,
            isActive: true,
            lastSeenAt: now,
            updatedAt: now,
          })
          .where(eq(affiliateProducts.id, productId));
        upsertedProducts++;
      } else {
        const [inserted] = await db
          .insert(affiliateProducts)
          .values({
            provider: "SHOPEE",
            externalProductId: offer.itemId,
            title: offer.title,
            normalizedTitle: normalized,
            category: offer.shopName || "Shopee Top Offer",
            productUrl: offer.affUrl,
            imageUrl: offer.imageUrl,
            currency: "VND",
            isActive: true,
            firstSeenAt: now,
            lastSeenAt: now,
          })
          .returning({ id: affiliateProducts.id });
        productId = inserted.id;
        upsertedProducts++;
      }

      // 2. Insert or update offer for the captured week
      const existingOffers = await db
        .select({ id: affiliateProductOffers.id })
        .from(affiliateProductOffers)
        .where(
          and(
            eq(affiliateProductOffers.productId, productId),
            eq(affiliateProductOffers.capturedWeek, currentWeek)
          )
        )
        .limit(1);

      let offerId: string;
      const commissionAmount = Math.round(offer.price * (offer.rate / 100));
      const sourceMetadata = JSON.stringify({
        shopName: offer.shopName,
        rating: offer.rating,
        discount: offer.discount,
        sellerRate: offer.sellerRate,
        originalPrice: offer.originalPrice,
        price: offer.price,
        soldText: offer.sold,
      });

      if (existingOffers.length > 0) {
        offerId = existingOffers[0].id;
        await db
          .update(affiliateProductOffers)
          .set({
            affiliateUrl: offer.affUrl,
            commissionRate: `${offer.rate}%`,
            commissionAmount,
            soldCount: offer.soldCount,
            source: "SHOPEE_OFFER_API",
            sourceMetadataJson: sourceMetadata,
            isActive: true,
            capturedAt: now,
          })
          .where(eq(affiliateProductOffers.id, offerId));
      } else {
        const [insertedOffer] = await db
          .insert(affiliateProductOffers)
          .values({
            productId,
            capturedWeek: currentWeek,
            capturedAt: now,
            affiliateUrl: offer.affUrl,
            commissionRate: `${offer.rate}%`,
            commissionAmount,
            soldCount: offer.soldCount,
            source: "SHOPEE_OFFER_API",
            sourceMetadataJson: sourceMetadata,
            isActive: true,
          })
          .returning({ id: affiliateProductOffers.id });
        offerId = insertedOffer.id;
        createdOffers++;
      }

      // 3. Record Deal Observation
      if (offer.price > 0) {
        await db.insert(productDealObservations).values({
          productId,
          offerId,
          observedAt: now,
          observedPrice: offer.price,
          originalPrice: offer.originalPrice || offer.price,
          currency: "VND",
          directDiscountPercent: offer.discount || null,
          directDiscountAmount: Math.max(0, offer.originalPrice - offer.price),
          source: "SHOPEE_OFFER_API",
          confidence: "1.00",
          rawMetadataJson: sourceMetadata,
        });
        createdObservations++;
      }
    }

    return {
      totalReceived: offers.length,
      upsertedProducts,
      createdOffers,
      createdObservations,
    };
  }

  /**
   * Queries top rate offers from the database with flexible filtering, searching and sorting
   */
  async listTopOffers(filters: TopOffersFilter = {}): Promise<{
    items: (MappedShopeeOffer & { id: string; offerId: string })[];
    total: number;
    stats: {
      maxRate: number;
      avgRate: number;
      count: number;
    };
  }> {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(100, Math.max(1, filters.limit || 24));
    const offset = (page - 1) * limit;

    // Build conditions
    const conditions: any[] = [
      eq(affiliateProducts.provider, "SHOPEE"),
      eq(affiliateProducts.isActive, true),
    ];

    if (filters.search?.trim()) {
      const term = `%${filters.search.trim()}%`;
      conditions.push(sql`(${affiliateProducts.title} ILIKE ${term} OR ${affiliateProducts.category} ILIKE ${term})`);
    }

    // Query products joined with their latest offer
    const baseQuery = db
      .select({
        productId: affiliateProducts.id,
        itemId: affiliateProducts.externalProductId,
        title: affiliateProducts.title,
        shopName: affiliateProducts.category,
        productUrl: affiliateProducts.productUrl,
        imageUrl: affiliateProducts.imageUrl,
        offerId: affiliateProductOffers.id,
        affUrl: affiliateProductOffers.affiliateUrl,
        commissionRate: affiliateProductOffers.commissionRate,
        commissionAmount: affiliateProductOffers.commissionAmount,
        soldCount: affiliateProductOffers.soldCount,
        metadataJson: affiliateProductOffers.sourceMetadataJson,
      })
      .from(affiliateProducts)
      .innerJoin(
        affiliateProductOffers,
        eq(affiliateProductOffers.productId, affiliateProducts.id)
      )
      .where(and(...conditions));

    const rows = await baseQuery;

    // Transform and filter in memory for dynamic parsed fields (rate, price, originalPrice)
    const mapped = rows.map((row) => {
      let meta: any = {};
      try {
        if (row.metadataJson) meta = JSON.parse(row.metadataJson);
      } catch {
        // ignore
      }

      const rawRate = row.commissionRate
        ? parseFloat(row.commissionRate.replace("%", "").replace(",", "."))
        : 0;

      return {
        id: row.productId,
        offerId: row.offerId,
        itemId: row.itemId || "",
        title: row.title,
        price: meta.price || (row.commissionAmount && rawRate ? Math.round((row.commissionAmount * 100) / rawRate) : 0),
        originalPrice: meta.originalPrice || 0,
        discount: meta.discount || "",
        rate: rawRate,
        sellerRate: meta.sellerRate || 0,
        imageUrl: row.imageUrl || "",
        affUrl: row.affUrl || row.productUrl,
        sold: meta.soldText || (row.soldCount ? String(row.soldCount) : "0"),
        soldCount: row.soldCount || 0,
        rating: meta.rating || 5,
        shopName: row.shopName || meta.shopName || "",
      };
    });

    // Apply price & rate filters
    let filtered = mapped.filter((item) => {
      if (filters.minPrice !== undefined && item.price < filters.minPrice) return false;
      if (filters.maxPrice !== undefined && item.price > filters.maxPrice) return false;
      if (filters.minRate !== undefined && item.rate < filters.minRate) return false;
      return true;
    });

    // Compute stats before slicing
    const total = filtered.length;
    const rates = filtered.map((i) => i.rate).filter((r) => r > 0);
    const maxRate = rates.length > 0 ? Math.max(...rates) : 0;
    const avgRate =
      rates.length > 0
        ? Math.round((rates.reduce((sum, r) => sum + r, 0) / rates.length) * 10) / 10
        : 0;

    // Apply sorting
    const sortBy = filters.sortBy || "rate_desc";
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "rate_desc":
          return b.rate - a.rate;
        case "rate_asc":
          return a.rate - b.rate;
        case "price_asc":
          return a.price - b.price;
        case "price_desc":
          return b.price - a.price;
        case "sold_desc":
          return b.soldCount - a.soldCount;
        default:
          return b.rate - a.rate;
      }
    });

    // Slice pagination
    const paged = filtered.slice(offset, offset + limit);

    return {
      items: paged,
      total,
      stats: {
        maxRate,
        avgRate,
        count: total,
      },
    };
  }
}

export const shopeeTopOffersService = new ShopeeTopOffersService();
