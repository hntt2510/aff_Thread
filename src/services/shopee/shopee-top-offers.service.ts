import { db } from "@/db";
import {
  affiliateProducts,
  affiliateProductOffers,
  productDealObservations,
} from "@/db/schema";
import { eq, desc, asc, and, ilike, gte, lte, sql } from "drizzle-orm";
import { normalizeVietnameseText } from "./relevance-evaluator.service";
import { getCurrentIsoWeek, evaluateDynamicRatingEligibility } from "./weekly-pool.service";

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
  item_rating?: { rating_star?: number; total_ratings?: number; rating_count?: number[]; [key: string]: any };
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
    item_rating?: { rating_star?: number; total_ratings?: number; rating_count?: number[]; [key: string]: any };
    is_official_shop?: boolean;
    total_ratings?: number;
    stock?: number;
    voucher_info?: any;
    [key: string]: any;
  };
  is_official_shop?: boolean;
  total_ratings?: number;
  stock?: number;
  voucher_info?: any;
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
  isOfficialShop?: boolean;
  totalRatings?: number;
  stock?: number;
  voucherCode?: string | null;
  voucherInfo?: any;
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

/**
 * Parses Vietnamese shorthand and formatted prices into VND integer.
 * Examples:
 * - "74,0k" -> 74000
 * - "74.5k" -> 74500
 * - "74k" -> 74000
 * - "106.820đ" / "106,820" / "106.820" -> 106820
 * - "125000" -> 125000
 * - "1,2tr" / "1.2tr" / "1tr" -> 1200000 / 1000000
 * - "74.000 - 99.000" -> 74000
 * - 9520000000 (micro-units) -> 95200
 */
export function parseShopeePrice(priceRaw: string | number | undefined | null): number {
  if (priceRaw === undefined || priceRaw === null) return 0;
  if (typeof priceRaw === "number") {
    if (priceRaw >= 10000000) return Math.round(priceRaw / 100000);
    return Math.round(priceRaw);
  }
  let s = String(priceRaw).trim().toLowerCase();
  if (!s) return 0;

  // Handle range like "74.000 - 99.000", pick first price
  if (s.includes("-")) {
    s = s.split("-")[0].trim();
  }

  // Suffix "k" (e.g. "74,0k", "74.5k", "74k")
  if (s.includes("k")) {
    const numStr = s.replace("k", "").replace("đ", "").replace(/\s/g, "").replace(",", ".");
    const val = parseFloat(numStr);
    return isNaN(val) ? 0 : Math.round(val * 1000);
  }

  // Suffix "tr" or "m" (e.g. "1,2tr", "1.5tr", "1tr")
  if (s.includes("tr") || s.includes("m")) {
    const numStr = s.replace("tr", "").replace("m", "").replace("đ", "").replace(/\s/g, "").replace(",", ".");
    const val = parseFloat(numStr);
    return isNaN(val) ? 0 : Math.round(val * 1000000);
  }

  // Remove currency symbol and whitespace
  s = s.replace(/[đvnd\s]/g, "");

  // If number contains dots or commas (e.g. "106.820" or "106,820")
  const digitsOnly = s.replace(/[^0-9]/g, "");
  const num = parseInt(digitsOnly, 10);
  if (isNaN(num)) return 0;
  if (num >= 10000000) return Math.round(num / 100000);
  return num;
}

/**
 * Parses historical sold count string/number into numeric integer.
 * Examples: "51", "1,2k", "1.2k", "50k+", "1tr+", "28"
 */
export function parseShopeeSoldCount(soldText: string | number | undefined | null): number {
  if (soldText === undefined || soldText === null) return 0;
  if (typeof soldText === "number") return Math.max(0, Math.round(soldText));

  const clean = String(soldText).toLowerCase().replace(/\s+/g, "").replace("+", "");
  if (!clean) return 0;

  if (clean.includes("tr") || clean.includes("m")) {
    const num = parseFloat(clean.replace("tr", "").replace("m", "").replace(",", "."));
    return isNaN(num) ? 0 : Math.round(num * 1000000);
  }
  if (clean.includes("k")) {
    const num = parseFloat(clean.replace("k", "").replace(",", "."));
    return isNaN(num) ? 0 : Math.round(num * 1000);
  }
  const num = parseInt(clean.replace(/[^0-9]/g, ""), 10);
  return isNaN(num) ? 0 : num;
}

/**
 * Tokenizes raw CSV text into a 2D array of strings, handling quotes, newlines, and commas.
 */
export function parseCsvRows(csvContent: string): string[][] {
  if (!csvContent) return [];
  const lines = csvContent.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const result: string[][] = [];

  for (const line of lines) {
    const row: string[] = [];
    let inQuote = false;
    let currentToken = "";

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuote = !inQuote;
      } else if (char === "," && !inQuote) {
        row.push(currentToken.trim());
        currentToken = "";
      } else {
        currentToken += char;
      }
    }
    row.push(currentToken.trim());
    result.push(row);
  }

  return result;
}

/**
 * Parses CSV export from Shopee Affiliate Batch Product Links.
 * Supports columns:
 * - 'Item Id': mã sản phẩm
 * - 'Item Name': tên sản phẩm
 * - 'Price': giá (VD: "74,0k" -> 74000)
 * - 'Sales': lượt bán (VD: "1.2k" -> 1200)
 * - 'Shop Name': tên shop
 * - 'Commission Rate': tỷ lệ hoa hồng (VD: "12,5%" -> 12.5)
 * - 'Product Link': link gốc sản phẩm
 * - 'Offer Link': link tiếp thị rút gọn chuẩn (VD: https://s.shopee.vn/8plfXi1bbd)
 */
export function parseShopeeBatchCsv(csvContent: string): MappedShopeeOffer[] {
  if (!csvContent || typeof csvContent !== "string") return [];

  const rows = parseCsvRows(csvContent.trim());
  if (rows.length < 2) return [];

  const normalizeHeader = (h: string) =>
    h
      .toLowerCase()
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\s_-]+/g, "");

  const headers = rows[0].map(normalizeHeader);

  const getColIndex = (keys: string[]) => {
    return headers.findIndex((h) => keys.some((k) => h === k || h.includes(k)));
  };

  const itemIdIdx = getColIndex(["itemid", "productid", "masanpham", "id"]);
  const nameIdx = getColIndex(["itemname", "tensanpham", "productname", "title", "name"]);
  const priceIdx = getColIndex(["price", "gia"]);
  const salesIdx = getColIndex(["sales", "sold", "daban", "luotban"]);
  const shopNameIdx = getColIndex(["shopname", "tenshop", "shop"]);
  const rateIdx = getColIndex(["commissionrate", "hoahong", "commission", "rate", "tylehoahong"]);
  const productLinkIdx = getColIndex(["productlink", "linkgoc", "producturl", "link"]);
  const offerLinkIdx = getColIndex(["offerlink", "shortlink", "afflink", "linkaff", "linktiepthi", "linkuudai", "affiliateurl"]);

  const offers: MappedShopeeOffer[] = [];

  for (let r = 1; r < rows.length; r++) {
    const rawRow = rows[r];
    if (!rawRow || rawRow.length === 0 || rawRow.every((c) => !c.trim())) continue;

    // Auto-heal unquoted numbers with comma if row was split by comma
    // e.g. ["74", "0k"] -> "74,0k" or ["12", "5%"] -> "12,5%"
    const row: string[] = [];
    for (let i = 0; i < rawRow.length; i++) {
      const cur = rawRow[i];
      const next = rawRow[i + 1];
      if (
        next !== undefined &&
        /^\d+$/.test(cur.trim()) &&
        /^\d+(k|tr|m|%)?$/i.test(next.trim()) &&
        (/[ktr%]/i.test(next.trim()) || (rawRow.length > headers.length && /^\d+$/.test(next.trim())))
      ) {
        row.push(`${cur.trim()},${next.trim()}`);
        i++; // skip next
      } else {
        row.push(cur);
      }
    }

    const rawItemId = itemIdIdx !== -1 && itemIdIdx < row.length ? row[itemIdIdx] : "";
    const rawName = nameIdx !== -1 && nameIdx < row.length ? row[nameIdx] : "";
    const rawPrice = priceIdx !== -1 && priceIdx < row.length ? row[priceIdx] : "";
    const rawSales = salesIdx !== -1 && salesIdx < row.length ? row[salesIdx] : "";
    const rawShop = shopNameIdx !== -1 && shopNameIdx < row.length ? row[shopNameIdx] : "";
    const rawRate = rateIdx !== -1 && rateIdx < row.length ? row[rateIdx] : "";
    const rawProductLink = productLinkIdx !== -1 && productLinkIdx < row.length ? row[productLinkIdx] : "";
    const rawOfferLink = offerLinkIdx !== -1 && offerLinkIdx < row.length ? row[offerLinkIdx] : "";

    const itemId = String(rawItemId || "").replace(/["']/g, "").trim();
    const title = String(rawName || "").replace(/^["']|["']$/g, "").trim();
    const cleanProductLink = String(rawProductLink || "").trim();
    const cleanOfferLink = String(rawOfferLink || "").trim();

    if (!itemId && !title && !cleanProductLink && !cleanOfferLink) continue;

    const price = parseShopeePrice(rawPrice);
    const sold = String(rawSales || "0").trim();
    const soldCount = parseShopeeSoldCount(sold);
    const shopName = String(rawShop || "").replace(/^["']|["']$/g, "").trim();

    const rateClean = String(rawRate || "0")
      .replace("%", "")
      .replace(",", ".")
      .trim();
    const rate = Math.round((parseFloat(rateClean) || 0) * 100) / 100;

    // CRITICAL: Always prioritize clean Offer Link (s.shopee.vn)
    const affUrl = cleanOfferLink || cleanProductLink;

    let finalItemId = itemId;
    if (!finalItemId) {
      const match = (cleanProductLink || cleanOfferLink).match(/\/product\/\d+\/(\d+)/) || (cleanProductLink || cleanOfferLink).match(/\/(\d+)(?:\?|$)/);
      if (match) {
        finalItemId = match[1];
      }
    }

    offers.push({
      itemId: finalItemId || (title ? `csv_${r}` : ""),
      title: title || (finalItemId ? `Sản phẩm #${finalItemId}` : "Sản phẩm Shopee"),
      price,
      originalPrice: price,
      discount: "",
      rate,
      sellerRate: 0,
      imageUrl: "",
      affUrl,
      sold,
      soldCount,
      rating: 5,
      shopName,
    });
  }

  return offers;
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

    const isOfficialShop = Boolean(
      card.is_official_shop ??
      item.is_official_shop ??
      card.show_official_shop_label ??
      item.show_official_shop_label ??
      /official|flagship|shopee\s*mall|mall/i.test(shopName)
    );

    const totalRatings = Number(
      card.item_rating?.total_ratings ??
      card.item_rating?.rating_count?.[0] ??
      card.rating_count ??
      card.total_ratings ??
      item.total_ratings ??
      item.item_rating?.total_ratings ??
      0
    ) || 0;

    const stock = card.stock !== undefined
      ? Number(card.stock)
      : (item.stock !== undefined ? Number(item.stock) : 999);

    const rawVoucherInfo = card.voucher_info ?? item.voucher_info ?? card.voucher ?? item.voucher ?? null;
    const voucherCode =
      rawVoucherInfo?.voucher_code ||
      rawVoucherInfo?.code ||
      rawVoucherInfo?.voucherCode ||
      null;

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
      isOfficialShop,
      totalRatings,
      stock,
      voucherCode,
      voucherInfo: rawVoucherInfo,
    };
  }

  extractProductList(rawInput: any): any[] {
    return extractProductList(rawInput);
  }

  parseShopeeBatchCsv(csvContent: string): MappedShopeeOffer[] {
    return parseShopeeBatchCsv(csvContent);
  }

  parseShopeePrice(priceRaw: string | number): number {
    return parseShopeePrice(priceRaw);
  }

  /**
   * Parses historical sold text (e.g. "51", "1,2k", "10.5k", "50k+") to numeric integer
   */
  parseSoldCount(soldText: string | number): number {
    return parseShopeeSoldCount(soldText);
  }

  /**
   * Filters offers and sorts prioritizing voucher-backed products and descending rate.
   * Optionally enforces dynamic rating threshold.
   */
  filterAndSortOffers(
    rawList: RawShopeeProductItem[],
    options?: { requireDynamicRating?: boolean }
  ): MappedShopeeOffer[] {
    if (!Array.isArray(rawList)) return [];

    let offers = rawList
      .map((item) => this.transformShopeeOffer(item))
      .filter((offer) => offer.itemId && offer.title && offer.rate > 0);

    if (options?.requireDynamicRating) {
      offers = offers.filter((offer) => {
        const eligibility = evaluateDynamicRatingEligibility({
          isOfficialShop: offer.isOfficialShop,
          totalRatings: offer.totalRatings,
          ratingStar: offer.rating,
          historicalSold: offer.soldCount,
          stock: offer.stock,
        });
        return eligibility.isEligible;
      });
    }

    return offers.sort((a, b) => {
      // Prioritize products with valid voucher codes
      const aVoucher = a.voucherCode ? 1 : 0;
      const bVoucher = b.voucherCode ? 1 : 0;
      if (bVoucher !== aVoucher) {
        return bVoucher - aVoucher;
      }
      return b.rate - a.rate;
    });
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
        .select({
          id: affiliateProducts.id,
          imageUrl: affiliateProducts.imageUrl,
          productUrl: affiliateProducts.productUrl,
        })
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
        const existingImg = existingProducts[0].imageUrl;
        // Keep existing image if incoming offer has no image or empty imageUrl!
        const finalImageUrl = offer.imageUrl?.trim() ? offer.imageUrl.trim() : (existingImg || undefined);

        // Keep or prioritize short link (s.shopee.vn)
        let finalProductUrl = offer.affUrl || existingProducts[0].productUrl;
        if (existingProducts[0].productUrl?.includes("s.shopee.vn") && !offer.affUrl?.includes("s.shopee.vn")) {
          finalProductUrl = existingProducts[0].productUrl;
        }

        await db
          .update(affiliateProducts)
          .set({
            title: offer.title,
            normalizedTitle: normalized,
            category: offer.shopName || "Shopee Top Offer",
            productUrl: finalProductUrl,
            imageUrl: finalImageUrl,
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
            productUrl: offer.affUrl || "https://shopee.vn",
            imageUrl: offer.imageUrl || null,
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
        .select({
          id: affiliateProductOffers.id,
          affiliateUrl: affiliateProductOffers.affiliateUrl,
        })
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
        soldCount: offer.soldCount,
        isOfficialShop: offer.isOfficialShop,
        totalRatings: offer.totalRatings,
        stock: offer.stock,
        voucherCode: offer.voucherCode,
        voucherInfo: offer.voucherInfo,
      });

      // Crucial: prioritize s.shopee.vn over long universal links
      let finalAffUrl = offer.affUrl;
      if (existingOffers.length > 0) {
        const existingUrl = existingOffers[0].affiliateUrl;
        if (existingUrl.includes("s.shopee.vn") && !offer.affUrl.includes("s.shopee.vn")) {
          finalAffUrl = existingUrl;
        }
      }

      const offerSource = offer.affUrl.includes("s.shopee.vn") ? "SHOPEE_BATCH_CSV" : "SHOPEE_OFFER_API";

      if (existingOffers.length > 0) {
        offerId = existingOffers[0].id;
        await db
          .update(affiliateProductOffers)
          .set({
            affiliateUrl: finalAffUrl,
            commissionRate: `${offer.rate}%`,
            commissionAmount,
            soldCount: offer.soldCount,
            source: offerSource,
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
            affiliateUrl: finalAffUrl,
            commissionRate: `${offer.rate}%`,
            commissionAmount,
            soldCount: offer.soldCount,
            source: offerSource,
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
