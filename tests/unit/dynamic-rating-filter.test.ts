import { describe, it, expect } from "vitest";
import { evaluateDynamicRatingEligibility } from "@/services/shopee/weekly-pool.service";
import { catalogScoringService } from "@/services/shopee/catalog-scoring.service";
import { shopeeTopOffersService } from "@/services/shopee/shopee-top-offers.service";

describe("Dynamic Rating Filter & Eligibility", () => {
  describe("evaluateDynamicRatingEligibility", () => {
    it("accepts rating_star >= 4.5 for official shop (Shopee Mall) with total_ratings >= 50", () => {
      const eligibleMall = evaluateDynamicRatingEligibility({
        isOfficialShop: true,
        totalRatings: 100,
        ratingStar: 4.5,
        historicalSold: 120,
        stock: 50,
      });
      expect(eligibleMall.isEligible).toBe(true);

      const rejectedMall = evaluateDynamicRatingEligibility({
        isOfficialShop: true,
        totalRatings: 100,
        ratingStar: 4.49,
        historicalSold: 120,
        stock: 50,
      });
      expect(rejectedMall.isEligible).toBe(false);
      expect(rejectedMall.reason).toContain("< 4.5 threshold");
    });

    it("strictly requires rating_star >= 4.6 for official shop when total_ratings < 50", () => {
      const mallLowRatings = evaluateDynamicRatingEligibility({
        isOfficialShop: true,
        totalRatings: 30, // < 50
        ratingStar: 4.5,
        historicalSold: 100,
        stock: 20,
      });
      expect(mallLowRatings.isEligible).toBe(false);
      expect(mallLowRatings.reason).toContain("< 4.6 strict threshold");

      const mallLowRatingsPassed = evaluateDynamicRatingEligibility({
        isOfficialShop: true,
        totalRatings: 30,
        ratingStar: 4.6,
        historicalSold: 100,
        stock: 20,
      });
      expect(mallLowRatingsPassed.isEligible).toBe(true);
    });

    it("strictly requires rating_star >= 4.6 for non-official (standard) shops", () => {
      const standardShop45 = evaluateDynamicRatingEligibility({
        isOfficialShop: false,
        totalRatings: 500,
        ratingStar: 4.55,
        historicalSold: 200,
        stock: 15,
      });
      expect(standardShop45.isEligible).toBe(false);
      expect(standardShop45.reason).toContain("< 4.6 strict threshold");

      const standardShop46 = evaluateDynamicRatingEligibility({
        isOfficialShop: false,
        totalRatings: 500,
        ratingStar: 4.6,
        historicalSold: 200,
        stock: 15,
      });
      expect(standardShop46.isEligible).toBe(true);
    });

    it("drops products with historical_sold < 50", () => {
      const lowSold = evaluateDynamicRatingEligibility({
        isOfficialShop: true,
        totalRatings: 100,
        ratingStar: 5.0,
        historicalSold: 49,
        stock: 100,
      });
      expect(lowSold.isEligible).toBe(false);
      expect(lowSold.reason).toContain("Historical sold (49) < 50 minimum threshold");

      const exactSold = evaluateDynamicRatingEligibility({
        isOfficialShop: true,
        totalRatings: 100,
        ratingStar: 4.9,
        historicalSold: 50,
        stock: 100,
      });
      expect(exactSold.isEligible).toBe(true);
    });

    it("drops products with stock <= 0", () => {
      const zeroStock = evaluateDynamicRatingEligibility({
        isOfficialShop: true,
        totalRatings: 100,
        ratingStar: 4.9,
        historicalSold: 500,
        stock: 0,
      });
      expect(zeroStock.isEligible).toBe(false);
      expect(zeroStock.reason).toContain("out of stock");

      const negativeStock = evaluateDynamicRatingEligibility({
        isOfficialShop: false,
        totalRatings: 100,
        ratingStar: 4.8,
        historicalSold: 200,
        stock: -3,
      });
      expect(negativeStock.isEligible).toBe(false);
      expect(negativeStock.reason).toContain("out of stock");
    });
  });

  describe("Voucher Prioritization & Score Boost", () => {
    it("boosts catalog score by 10 points when a valid voucher exists", () => {
      const baseInput = {
        soldCount: 500,
        commissionRate: 0.1,
        capturedAt: new Date(),
      };

      const withoutVoucher = catalogScoringService.evaluate(baseInput);
      const withVoucher = catalogScoringService.evaluate({
        ...baseInput,
        hasVoucher: true,
        voucherCode: "LOCK20K",
      });

      expect(withVoucher.components.voucherBonus).toBe(10);
      expect(withVoucher.score).toBe(Math.min(100, withoutVoucher.score + 10));
    });

    it("sorts voucher-backed products first in filterAndSortOffers", () => {
      const rawOffers = [
        {
          item_id: "prod-no-voucher",
          title: "Sản phẩm A",
          price: "100000",
          rate: 15,
          sold: "200",
          rating: 4.8,
          batch_item_for_item_card_full: {
            itemid: "prod-no-voucher",
            name: "Sản phẩm A",
            price: 100000,
            stock: 50,
            item_rating: { rating_star: 4.8, total_ratings: 100 },
          },
        },
        {
          item_id: "prod-with-voucher",
          title: "Sản phẩm B",
          price: "100000",
          rate: 10,
          sold: "200",
          rating: 4.8,
          batch_item_for_item_card_full: {
            itemid: "prod-with-voucher",
            name: "Sản phẩm B",
            price: 100000,
            stock: 50,
            item_rating: { rating_star: 4.8, total_ratings: 100 },
            voucher_info: { voucher_code: "VOUCHER10K" },
          },
        },
      ];

      const sorted = shopeeTopOffersService.filterAndSortOffers(rawOffers, {
        requireDynamicRating: true,
      });

      expect(sorted.length).toBe(2);
      expect(sorted[0].itemId).toBe("prod-with-voucher");
      expect(sorted[0].voucherCode).toBe("VOUCHER10K");
      expect(sorted[1].itemId).toBe("prod-no-voucher");
    });
  });
});
