import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  ShopeeShopVoucherService,
  RawShopVoucher,
} from "@/services/shopee/shop-voucher.service";
import { extractShopId } from "@/services/shopee/weekly-pool.service";
import { extractAndCalculateShopeeDeal } from "@/services/shopee/automated-deal-pipeline";

describe("ShopeeShopVoucherService & Enrichment Pipeline", () => {
  let service: ShopeeShopVoucherService;

  beforeEach(() => {
    service = new ShopeeShopVoucherService();
    service.clearCache();
    vi.restoreAllMocks();
  });

  describe("Voucher Matching & Micro-currency Normalization", () => {
    const torridenVouchers: RawShopVoucher[] = [
      {
        voucher_code: "TORR20K",
        min_spend: 15000000000, // 150,000 VND in micro-units
        discount_value: 2000000000, // 20,000 VND in micro-units
        title: "Giảm 20k đơn từ 150k",
      },
      {
        voucher_code: "TORR40K",
        min_spend: 30000000000, // 300,000 VND in micro-units
        discount_value: 4000000000, // 40,000 VND in micro-units
        title: "Giảm 40k đơn từ 300k",
      },
      {
        voucher_code: "TORR10PCT",
        min_spend: 20000000000, // 200,000 VND in micro-units
        discount_percentage: 10,
        discount_cap: 2500000000, // 25,000 VND in micro-units
        title: "Giảm 10% tối đa 25k đơn từ 200k",
      },
    ];

    it("selects the highest applicable voucher for Torriden (353.800đ -> 40k off)", () => {
      const best = service.findBestVoucher(353800, torridenVouchers);
      expect(best).not.toBeNull();
      expect(best?.voucherCode).toBe("TORR40K");
      expect(best?.discountAmount).toBe(40000);
      expect(best?.discountType).toBe("FIXED");
      expect(best?.minSpend).toBe(300000);
    });

    it("falls back to lower tier when price meets only mid-tier minimum spend (180.000đ)", () => {
      const best = service.findBestVoucher(180000, torridenVouchers);
      expect(best).not.toBeNull();
      expect(best?.voucherCode).toBe("TORR20K");
      expect(best?.discountAmount).toBe(20000);
      expect(best?.minSpend).toBe(150000);
    });

    it("returns null when item price is below all minimum spends (100.000đ)", () => {
      const best = service.findBestVoucher(100000, torridenVouchers);
      expect(best).toBeNull();
    });

    it("evaluates percentage discount with cap accurately (220.000đ -> 10% capped at 22k vs TORR20K)", () => {
      // 220,000đ * 10% = 22,000đ (< 25k cap). 22,000đ beats 20,000đ (TORR20K)
      const best = service.findBestVoucher(220000, torridenVouchers);
      expect(best).not.toBeNull();
      expect(best?.voucherCode).toBe("TORR10PCT");
      expect(best?.discountAmount).toBe(22000);
      expect(best?.discountType).toBe("PERCENT");
    });

    it("respects voucher validity window", () => {
      const expiredVouchers: RawShopVoucher[] = [
        {
          voucher_code: "EXPIRED_CODE",
          min_spend: 50000,
          discount_value: 15000,
          start_time: Math.floor(Date.now() / 1000) - 10000,
          end_time: Math.floor(Date.now() / 1000) - 100, // expired in past
        },
      ];
      const best = service.findBestVoucher(200000, expiredVouchers);
      expect(best).toBeNull();
    });
  });

  describe("Caching & Deduplicated Batch Fetching", () => {
    it("deduplicates identical shop IDs and calls fetch only once per unique shop", async () => {
      const mockVouchers = [
        {
          voucher_code: "SHOP123_10K",
          min_spend: 100000,
          discount_value: 10000,
        },
      ];

      const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async () => {
        return {
          ok: true,
          json: async () => ({
            error: 0,
            data: { vouchers: mockVouchers },
          }),
        } as any;
      });

      // 4 items from shop 123456 and 2 items from shop 789012
      const shopIds = ["123456", "123456", "123456", "789012", "789012"];
      const batchResult = await service.getShopVouchersBatch(shopIds, 3);

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(batchResult.get("123456")).toHaveLength(1);
      expect(batchResult.get("789012")).toHaveLength(1);

      // Subsequent call should hit in-memory cache without additional fetch calls
      await service.getShopVouchersBatch(["123456"]);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe("extractShopId Helper", () => {
    it("extracts from direct product.shopId", () => {
      expect(extractShopId({ shopId: "344837665", productUrl: "https://shopee.vn/product/999/111" })).toBe("344837665");
    });

    it("extracts from metadata shopid / batch_item_for_item_card_full", () => {
      const meta = { batch_item_for_item_card_full: { shopid: 344837665 } };
      expect(extractShopId({ productUrl: "https://shopee.vn/some-item" }, meta)).toBe("344837665");
    });

    it("extracts from standard Shopee product URL format", () => {
      const url = "https://shopee.vn/universal-link/product/344837665/57458114650?utm_source=aff";
      expect(extractShopId({ productUrl: url })).toBe("344837665");
    });

    it("extracts from slug-i.shopid.itemid URL format", () => {
      const url = "https://shopee.vn/Serum-Torriden-Dive-In-50ml-i.344837665.57458114650";
      expect(extractShopId({ productUrl: url })).toBe("344837665");
    });
  });

  describe("End-to-End Deal Calculation with Enriched Shop Voucher", () => {
    it("stacks enriched shop voucher (40k) with platform baseline discount", () => {
      const rawPrice = 353800;
      const rawOrig = 450000;

      // Candidate initially had NO voucher in feed
      const rawVoucher = null;
      const voucherCode = null;

      // Stage 2 enrichment finds 40k voucher
      const storefrontVoucher = {
        voucher_code: "TORR40K",
        discount_value: 40000,
        min_spend: 300000,
        label: "Giảm 40k đơn từ 300k",
      };

      const dealFacts = extractAndCalculateShopeeDeal({
        price: rawPrice,
        priceBeforeDiscount: rawOrig,
        voucherInfo: {
          voucher_code: storefrontVoucher.voucher_code,
          discount_value: storefrontVoucher.discount_value,
          min_spend: storefrontVoucher.min_spend,
        },
        voucherCode: storefrontVoucher.voucher_code,
        commissionRate: "12.5%",
      });

      // Base price: 353.800đ
      expect(dealFacts.basePrice).toBe(353800);
      // Shop discount: 40.000đ
      expect(dealFacts.voucherDiscountAmount).toBe(40000);
      expect(dealFacts.voucherCode).toBe("TORR40K");

      // Platform voucher baseline (10% max 25k): 25.000đ
      expect(dealFacts.stackedPricing?.platformDiscountAmount).toBe(25000);
      expect(dealFacts.stackedPricing?.shopDiscountAmount).toBe(40000);

      // Stacked final price: 353.800 - 40.000 - 25.000 = 288.800đ
      expect(dealFacts.stackedPricing?.finalPrice).toBe(288800);
      expect(dealFacts.stackedPricing?.finalPrice).toBeLessThan(dealFacts.basePrice);
    });
  });
});
