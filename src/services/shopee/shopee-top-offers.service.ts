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
  item_id?: string | number;
  itemid?: string | number;
  itemId?: string | number;
  title?: string;
  name?: string;
  long_link?: string;
  product_link?: string;
  productUrl?: string;
  affUrl?: string;
  affiliate_url?: string;
  url?: string;
  default_commission_rate?: string | number;
  commission_rate?: string | number;
  seller_commission_rate?: string | number;
  rate?: string | number;
  sellerRate?: string | number;
  price?: string | number;
  price_before_discount?: string | number;
  originalPrice?: string | number;
  original_price?: string | number;
  discount?: string;
  image?: string;
  imageUrl?: string;
  image_url?: string;
  historical_sold_text?: string | number;
  sold?: string | number;
  sold_count?: string | number;
  soldCount?: string | number;
  shop_name?: string;
  shopName?: string;
  rating?: number;
  item_rating?: { rating_star?: number };
  batch_item_for_item_card_full?: {
    itemid?: string | number;
    name?: string;
    title?: string;
    price?: string | number;
    price_before_discount?: string | number;
    discount?: string;
    image?: string;
    imageUrl?: string;
    historical_sold_text?: string | number;
    sold?: string | number;
    shop_name?: string;
    item_rating?: { rating_star?: number };
    [key: string]: any;
  };
  [key: string]: any;
}

/**
 * Trích xuất danh sách sản phẩm linh hoạt từ nhiều định dạng JSON Shopee khác nhau
 */
export function extractProductList(rawInput: any): any[] {
  let data = rawInput;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data.trim());
    } catch {
      return [];
    }
  }

  // Handle common wrappers from API body / UI payloads (e.g. { rawData: ... } or { jsonContent: ... })
  if (data && typeof data === "object" && !Array.isArray(data)) {
    if (data.rawData !== undefined) {
      const extracted = extractProductList(data.rawData);
      if (extracted.length > 0) return extracted;
    }
    if (data.jsonContent !== undefined) {
      const extracted = extractProductList(data.jsonContent);
      if (extracted.length > 0) return extracted;
    }
  }

  // 1. Dạng mảng trực tiếp
  if (Array.isArray(data)) return data;

  // 2. Dạng response chuẩn { code: 0, data: { list: [...] } }
  if (Array.isArray(data?.data?.list)) return data.data.list;

  // 3. Dạng response { list: [...] }
  if (Array.isArray(data?.list)) return data.list;

  // 4. Dạng { data: { products: [...] } } hoặc { products: [...] }
  if (Array.isArray(data?.data?.products)) return data.data.products;
  if (Array.isArray(data?.products)) return data.products;

  // 5. Dạng { data: { items: [...] } } hoặc { items: [...] }
  if (Array.isArray(data?.data?.items)) return data.data.items;
  if (Array.isArray(data?.items)) return data.items;

  // 6. Dạng { data: [...] }
  if (Array.isArray(data?.data)) return data.data;

  // 7. Single item
  if (data && typeof data === "object") {
    if (data.item_id || data.itemid || data.itemId || data.batch_item_for_item_card_full) {
      return [data];
    }
  }

  return [];
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
    // Thông tin chi tiết: ưu tiên item.batch_item_for_item_card_full, nếu không có thì fallback sang chính item
    const card = item.batch_item_for_item_card_full || item || {};

    // item_id lấy từ: item.item_id || item.itemid || item.batch_item_for_item_card_full?.itemid
    const rawId =
      item.item_id ??
      item.itemid ??
      item.itemId ??
      item.batch_item_for_item_card_full?.itemid ??
      card.itemid ??
      card.itemId ??
      "";
    const itemId = String(rawId).trim();

    const title =
      String(card.name || card.title || item.title || item.name || "").trim() ||
      (itemId ? `Sản phẩm #${itemId}` : "");

    // Price conversion: Shopee micro-currency / 100000 if micro-units
    let price = 0;
    if (item.batch_item_for_item_card_full?.price !== undefined) {
      const rawPrice = Number(item.batch_item_for_item_card_full.price || 0);
      price = rawPrice > 0 ? (rawPrice >= 100000 ? Math.round(rawPrice / 100000) : rawPrice) : 0;
    } else {
      const rawPrice = Number(card.price ?? item.price ?? 0);
      price = rawPrice > 0 ? (rawPrice >= 10000000 ? Math.round(rawPrice / 100000) : rawPrice) : 0;
    }

    let originalPrice = price;
    if (item.batch_item_for_item_card_full?.price_before_discount !== undefined) {
      const rawOrig = Number(item.batch_item_for_item_card_full.price_before_discount || 0);
      originalPrice = rawOrig > 0 ? (rawOrig >= 100000 ? Math.round(rawOrig / 100000) : rawOrig) : price;
    } else {
      const rawOrig = Number(
        card.price_before_discount ??
        card.original_price ??
        card.originalPrice ??
        item.price_before_discount ??
        item.original_price ??
        item.originalPrice ??
        0
      );
      originalPrice = rawOrig > 0 ? (rawOrig >= 10000000 ? Math.round(rawOrig / 100000) : rawOrig) : price;
    }

    const discount = String(card.discount ?? item.discount ?? "").trim();

    // commission_rate lấy từ: item.default_commission_rate || item.commission_rate || item.seller_commission_rate || "0%"
    const rawRateStr = String(
      item.default_commission_rate ??
      item.commission_rate ??
      item.seller_commission_rate ??
      item.rate ??
      card.commission_rate ??
      "0%"
    )
      .replace("%", "")
      .replace(",", ".")
      .trim();
    const rate = Math.round((parseFloat(rawRateStr) || 0) * 100) / 100;

    const rawSellerRateStr = String(
      item.seller_commission_rate ??
      item.sellerRate ??
      card.seller_commission_rate ??
      "0%"
    )
      .replace("%", "")
      .replace(",", ".")
      .trim();
    const sellerRate = Math.round((parseFloat(rawSellerRateStr) || 0) * 100) / 100;

    // Image URL via Shopee CDN or direct URL
    const imageRaw = String(
      card.image ??
      card.imageUrl ??
      item.image ??
      item.imageUrl ??
      item.image_url ??
      ""
    ).trim();
    let imageUrl = "";
    if (imageRaw) {
      if (imageRaw.startsWith("http://") || imageRaw.startsWith("https://")) {
        imageUrl = imageRaw;
      } else {
        imageUrl = `https://down-vn.img.susercontent.com/file/${imageRaw}`;
      }
    }

    // Affiliate/Product Link
    const affUrl = String(
      item.long_link ||
      item.product_link ||
      item.affUrl ||
      item.affiliate_url ||
      item.productUrl ||
      item.url ||
      card.affUrl ||
      card.product_link ||
      ""
    ).trim();

    const sold = String(
      card.historical_sold_text ??
      card.sold ??
      item.historical_sold_text ??
      item.sold ??
      item.sold_count ??
      item.soldCount ??
      "0"
    ).trim();
    const soldCount = this.parseSoldCount(sold);

    const rating = Number(
      card.item_rating?.rating_star ??
      card.rating_star ??
      card.rating ??
      item.item_rating?.rating_star ??
      item.rating ??
      5
    ) || 5;

    const shopName = String(
      card.shop_name ??
      card.shopName ??
      item.shop_name ??
      item.shopName ??
      ""
    ).trim();

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

  extractProductList(rawInput: any): any[] {
    return extractProductList(rawInput);
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
