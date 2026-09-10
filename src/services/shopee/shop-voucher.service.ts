/**
 * Shopee Shop Voucher Service.
 * Fetches, caches, normalizes, and evaluates storefront vouchers directly from Shopee's public voucher wallet API:
 *   GET https://shopee.vn/api/v2/voucher_wallet/get_shop_vouchers_by_shopid?shopid={shopid}
 */

import { parseShopeePrice } from "./shopee-top-offers.service";

export interface RawShopVoucher {
  voucher_code?: string;
  code?: string;
  promo_code?: string;
  voucher_id?: number | string;
  min_spend?: number | string;
  minSpend?: number | string;
  discount_percentage?: number | string;
  discount_percent?: number | string;
  discountPercentage?: number | string;
  discount_value?: number | string;
  discount_amount?: number | string;
  discountValue?: number | string;
  discountAmount?: number | string;
  discount_cap?: number | string;
  max_discount?: number | string;
  discountCap?: number | string;
  maxDiscount?: number | string;
  start_time?: number | string;
  startTime?: number | string;
  end_time?: number | string;
  endTime?: number | string;
  title?: string;
  label?: string;
  voucher_name?: string;
  name?: string;
  reward_type?: number;
  voucher_type?: number;
  [key: string]: any;
}

export interface BestShopVoucherResult {
  voucherCode: string;
  discountAmount: number;
  discountType: "PERCENT" | "FIXED";
  discountPercent?: number;
  minSpend: number;
  maxDiscount?: number;
  label: string;
  rawVoucher: RawShopVoucher;
}

interface CacheEntry {
  vouchers: RawShopVoucher[];
  expiresAt: number;
}

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

export class ShopeeShopVoucherService {
  readonly version = "v1.0.0-shop-voucher";
  private cache = new Map<string, CacheEntry>();
  private readonly defaultTtlMs = 60 * 60 * 1000; // 1 hour
  private readonly endpoint = "https://shopee.vn/api/v2/voucher_wallet/get_shop_vouchers_by_shopid";

  /**
   * Clears the in-memory voucher cache (useful for testing).
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Sets cache entry directly (useful for tests and pre-warming).
   */
  setCache(shopId: string, vouchers: RawShopVoucher[], ttlMs = this.defaultTtlMs): void {
    this.cache.set(String(shopId), {
      vouchers,
      expiresAt: Date.now() + ttlMs,
    });
  }

  /**
   * Retrieves cached vouchers if available and not expired.
   */
  getCachedVouchers(shopId: string): RawShopVoucher[] | null {
    const entry = this.cache.get(String(shopId));
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(String(shopId));
      return null;
    }
    return entry.vouchers;
  }

  /**
   * Fetches storefront vouchers for a single shop ID.
   * Returns cached list if available.
   */
  async fetchShopVouchers(shopId: string | number): Promise<RawShopVoucher[]> {
    const idStr = String(shopId).trim();
    if (!idStr) return [];

    const cached = this.getCachedVouchers(idStr);
    if (cached) return cached;

    const url = `${this.endpoint}?shopid=${encodeURIComponent(idStr)}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const res = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent": DEFAULT_USER_AGENT,
          Referer: "https://shopee.vn/",
          Accept: "application/json",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        return [];
      }

      const json = await res.json();
      const rawList =
        json.data?.vouchers ||
        json.data?.shop_vouchers ||
        json.data ||
        json.vouchers ||
        [];

      const vouchers: RawShopVoucher[] = Array.isArray(rawList) ? rawList : [];
      this.setCache(idStr, vouchers);
      return vouchers;
    } catch {
      // Graceful fallback on network timeout or parse failure
      return [];
    }
  }

  /**
   * Batch fetches vouchers for multiple shop IDs with deduplication and concurrency control.
   * Concurrency is bounded (max 3 concurrent requests) with request spacing.
   */
  async getShopVouchersBatch(
    shopIds: Array<string | number>,
    concurrency = 3
  ): Promise<Map<string, RawShopVoucher[]>> {
    const resultMap = new Map<string, RawShopVoucher[]>();
    const uniqueIds = Array.from(
      new Set(shopIds.map((id) => String(id).trim()).filter(Boolean))
    );

    const pendingIds: string[] = [];

    // Check cache first
    for (const id of uniqueIds) {
      const cached = this.getCachedVouchers(id);
      if (cached) {
        resultMap.set(id, cached);
      } else {
        pendingIds.push(id);
      }
    }

    if (pendingIds.length === 0) {
      return resultMap;
    }

    // Process pending IDs with concurrency pool
    let currentIndex = 0;
    const worker = async () => {
      while (currentIndex < pendingIds.length) {
        const id = pendingIds[currentIndex++];
        try {
          const vouchers = await this.fetchShopVouchers(id);
          resultMap.set(id, vouchers);
        } catch {
          resultMap.set(id, []);
        }
        // Small spacing between requests to be polite to the storefront API
        await new Promise((r) => setTimeout(r, 40));
      }
    };

    const workers = Array.from({ length: Math.min(concurrency, pendingIds.length) }, () =>
      worker()
    );
    await Promise.all(workers);

    return resultMap;
  }

  /**
   * Matches the best applicable shop voucher for a product given its observed price.
   * Filters by minimum spend, checks temporal validity, and evaluates monetary discount.
   */
  findBestVoucher(
    itemPrice: number,
    vouchers: RawShopVoucher[],
    evaluationTime: Date = new Date()
  ): BestShopVoucherResult | null {
    if (!vouchers || vouchers.length === 0 || itemPrice <= 0) {
      return null;
    }

    const evalTimeMs = evaluationTime.getTime();
    let bestMatch: BestShopVoucherResult | null = null;
    let maxSaving = 0;

    for (const v of vouchers) {
      // 1. Code extraction
      const rawCode =
        v.voucher_code ??
        v.code ??
        v.promo_code ??
        v.voucher_id ??
        null;
      const voucherCode = typeof rawCode === "string" && rawCode.trim() ? rawCode.trim() : (rawCode ? String(rawCode) : null);
      if (!voucherCode) continue;

      // 2. Minimum Spend (normalized from micro-currency if >= 10^7)
      const rawMinSpend = v.min_spend ?? v.minSpend ?? 0;
      const minSpend = parseShopeePrice(rawMinSpend);
      if (itemPrice < minSpend) {
        continue; // Does not meet minimum order spend
      }

      // 3. Validity Time Check
      const rawStart = v.start_time ?? v.startTime;
      if (rawStart) {
        const startMs =
          typeof rawStart === "number" && rawStart < 10000000000
            ? rawStart * 1000
            : new Date(rawStart).getTime();
        if (!isNaN(startMs) && evalTimeMs < startMs) {
          continue; // Not yet valid
        }
      }

      const rawEnd = v.end_time ?? v.endTime;
      if (rawEnd) {
        const endMs =
          typeof rawEnd === "number" && rawEnd < 10000000000
            ? rawEnd * 1000
            : new Date(rawEnd).getTime();
        if (!isNaN(endMs) && evalTimeMs > endMs) {
          continue; // Expired
        }
      }

      // 4. Calculate Monetary Saving
      let discountAmount = 0;
      let discountType: "PERCENT" | "FIXED" = "FIXED";
      let discountPercent: number | undefined = undefined;

      // Check percentage discount
      let pct = Number(
        v.discount_percentage ?? v.discount_percent ?? v.discountPercentage ?? 0
      );
      if (isNaN(pct)) pct = 0;
      if (pct > 0 && pct <= 1.0) pct = pct * 100; // 0.1 -> 10%

      const rawCap = v.discount_cap ?? v.max_discount ?? v.discountCap ?? v.maxDiscount;
      const cap = rawCap !== undefined && rawCap !== null ? parseShopeePrice(rawCap) : 0;

      const rawVal = v.discount_value ?? v.discount_amount ?? v.discountValue ?? v.discountAmount;
      const fixedVal = rawVal !== undefined && rawVal !== null ? parseShopeePrice(rawVal) : 0;

      if (pct > 0) {
        discountType = "PERCENT";
        discountPercent = pct;
        let calculated = Math.round(itemPrice * (pct / 100));
        if (cap > 0 && calculated > cap) {
          calculated = cap;
        }
        discountAmount = calculated;
      } else if (fixedVal > 0) {
        discountType = "FIXED";
        discountAmount = Math.min(fixedVal, itemPrice);
      }

      if (discountAmount <= 0) continue;

      // Label
      const label =
        v.title ||
        v.label ||
        v.voucher_name ||
        v.name ||
        (discountType === "PERCENT"
          ? `Giảm ${discountPercent}%${cap > 0 ? ` tối đa ${cap.toLocaleString("vi-VN")}đ` : ""}`
          : `Giảm ${discountAmount.toLocaleString("vi-VN")}đ`);

      // 5. Select highest saving, break ties by lower min_spend
      if (
        discountAmount > maxSaving ||
        (discountAmount === maxSaving && bestMatch && minSpend < bestMatch.minSpend)
      ) {
        maxSaving = discountAmount;
        bestMatch = {
          voucherCode,
          discountAmount,
          discountType,
          discountPercent,
          minSpend,
          maxDiscount: cap > 0 ? cap : undefined,
          label,
          rawVoucher: v,
        };
      }
    }

    return bestMatch;
  }
}

export const shopeeShopVoucherService = new ShopeeShopVoucherService();
