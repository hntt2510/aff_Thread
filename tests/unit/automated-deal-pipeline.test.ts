import { describe, it, expect } from "vitest";
import {
  formatCommissionRate,
  extractVoucherFacts,
  extractAndCalculateShopeeDeal,
} from "@/services/shopee/automated-deal-pipeline";

describe("Automated Deal Pipeline and Formatting", () => {
  describe("formatCommissionRate", () => {
    it("formats percentage strings without multiplying by 100", () => {
      expect(formatCommissionRate("22%")).toBe("22.0%");
      expect(formatCommissionRate("12%")).toBe("12.0%");
      expect(formatCommissionRate("12,5%")).toBe("12.5%");
      expect(formatCommissionRate("9.5%")).toBe("9.5%");
    });

    it("formats percentage numbers in 1-100 range directly", () => {
      expect(formatCommissionRate(22)).toBe("22.0%");
      expect(formatCommissionRate(12.5)).toBe("12.5%");
      expect(formatCommissionRate(9)).toBe("9.0%");
    });

    it("formats 0-1 ratio decimal numbers as percentages", () => {
      expect(formatCommissionRate(0.22)).toBe("22.0%");
      expect(formatCommissionRate(0.125)).toBe("12.5%");
      expect(formatCommissionRate("0.22")).toBe("22.0%");
      expect(formatCommissionRate("0.05")).toBe("5.0%");
    });

    it("handles null, undefined, empty, or invalid inputs safely", () => {
      expect(formatCommissionRate(null)).toBe("—");
      expect(formatCommissionRate(undefined)).toBe("—");
      expect(formatCommissionRate("")).toBe("—");
      expect(formatCommissionRate("abc")).toBe("—");
    });
  });

  describe("extractVoucherFacts", () => {
    it("extracts percentage voucher with min_spend and max_discount", () => {
      const voucher = {
        voucher_code: "SALE20",
        discount_percentage: 20,
        min_spend: 10000000000,
        max_discount: 3000000000,
        start_time: 1715000000,
        end_time: 1716000000,
      };

      const facts = extractVoucherFacts(voucher);
      expect(facts.voucherCode).toBe("SALE20");
      expect(facts.voucherDiscountType).toBe("PERCENT");
      expect(facts.voucherDiscountPercent).toBe(20);
      expect(facts.voucherMinSpend).toBe(100000);
      expect(facts.voucherMaxDiscount).toBe(30000);
      expect(facts.voucherValidFrom).toBeInstanceOf(Date);
      expect(facts.voucherValidUntil).toBeInstanceOf(Date);
    });

    it("extracts fixed discount voucher from label or amount", () => {
      const voucher = {
        code: "GIAM15K",
        discount_amount: 15000,
        min_spend: 50000,
      };

      const facts = extractVoucherFacts(voucher);
      expect(facts.voucherCode).toBe("GIAM15K");
      expect(facts.voucherDiscountType).toBe("FIXED");
      expect(facts.voucherDiscountAmount).toBe(15000);
      expect(facts.voucherMinSpend).toBe(50000);
    });

    it("extracts discount info from label when fields are missing", () => {
      const voucher = {
        voucher_code: "VOUCHER10",
        label: "Giảm 10% tối đa 20k",
      };

      const facts = extractVoucherFacts(voucher);
      expect(facts.voucherCode).toBe("VOUCHER10");
      expect(facts.voucherDiscountType).toBe("PERCENT");
      expect(facts.voucherDiscountPercent).toBe(10);
    });

    it("returns null fields safely for empty or invalid input", () => {
      const facts = extractVoucherFacts(null);
      expect(facts.voucherCode).toBeNull();
      expect(facts.voucherDiscountType).toBeNull();
      expect(facts.voucherDiscountPercent).toBeNull();
      expect(facts.voucherDiscountAmount).toBeNull();
    });
  });

  describe("extractAndCalculateShopeeDeal", () => {
    it("handles Shopee 5-zero micro-currency price automatically", () => {
      const deal = extractAndCalculateShopeeDeal({
        price: "12600000000",
        priceBeforeDiscount: "15000000000",
        commissionRate: "22%",
      });

      expect(deal.basePrice).toBe(126000);
      expect(deal.originalPrice).toBe(150000);
      expect(deal.estimatedFinalPrice).toBe(126000);
      expect(deal.dealOpportunityScore).toBeGreaterThan(0);
      expect(deal.dealOpportunity.components.extraPerks).toBeGreaterThan(0);
    });

    it("handles 'k' notation in prices (e.g. 74.0k)", () => {
      const deal = extractAndCalculateShopeeDeal({
        price: "74.0k",
        priceBeforeDiscount: "100.0k",
        commissionRate: 15,
      });

      expect(deal.basePrice).toBe(74000);
      expect(deal.originalPrice).toBe(100000);
      expect(deal.estimatedFinalPrice).toBe(74000);
    });

    it("calculates estimatedFinalPrice with valid percentage voucher", () => {
      const now = new Date();
      const validUntil = new Date(now.getTime() + 86400000);

      const deal = extractAndCalculateShopeeDeal({
        price: 200000,
        priceBeforeDiscount: 250000,
        commissionRate: "18%",
        voucherInfo: {
          voucher_code: "GIAM10",
          discount_percentage: 10,
          max_discount: 50000,
          min_spend: 100000,
          valid_until: validUntil.toISOString(),
        },
        evaluationTime: now,
      });

      expect(deal.basePrice).toBe(200000);
      expect(deal.originalPrice).toBe(250000);
      expect(deal.voucherCode).toBe("GIAM10");
      expect(deal.voucherDiscountPercent).toBe(10);
      // 10% of 200,000 = 20,000 discount -> final price 180,000
      expect(deal.discountAmount).toBe(20000);
      expect(deal.estimatedFinalPrice).toBe(180000);
      expect(deal.applicable).toBe("YES");
      expect(deal.dealOpportunityScore).toBeGreaterThan(40);
    });

    it("calculates estimatedFinalPrice with fixed amount voucher", () => {
      const deal = extractAndCalculateShopeeDeal({
        price: 100000,
        voucherInfo: {
          voucher_code: "FIXED20K",
          discount_amount: 20000,
          min_spend: 50000,
        },
      });

      expect(deal.basePrice).toBe(100000);
      expect(deal.discountAmount).toBe(20000);
      expect(deal.estimatedFinalPrice).toBe(80000);
    });
  });
});
