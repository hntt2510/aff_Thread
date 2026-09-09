import { describe, it, expect } from "vitest";
import {
  parseSoldCount,
  parseCommissionRate,
  parseCommissionAmount,
  normalizeRawProductOffer,
} from "../src/normalization/normalizer.js";

describe("Worker Product Normalization", () => {
  describe("Numeric Parsers", () => {
    it("parses Vietnamese sold count strings correctly", () => {
      expect(parseSoldCount("Đã bán 1.5k")).toBe(1500);
      expect(parseSoldCount("Đã bán 1,2k")).toBe(1200);
      expect(parseSoldCount("10k+")).toBe(10000);
      expect(parseSoldCount("Đã bán 500")).toBe(500);
      expect(parseSoldCount("1.2m")).toBe(1200000);
      expect(parseSoldCount(1250)).toBe(1250);
      expect(parseSoldCount("")).toBeNull();
      expect(parseSoldCount(null)).toBeNull();
    });

    it("parses commission rate percentages correctly", () => {
      expect(parseCommissionRate("15%")).toBe(15);
      expect(parseCommissionRate("12.5%")).toBe(12.5);
      expect(parseCommissionRate("12,5%")).toBe(12.5);
      expect(parseCommissionRate(0.15)).toBe(15);
      expect(parseCommissionRate(15)).toBe(15);
      expect(parseCommissionRate(null)).toBeNull();
      expect(parseCommissionRate("N/A")).toBeNull();
    });

    it("parses commission amount safely", () => {
      expect(parseCommissionAmount("50.000₫")).toBe(50000);
      expect(parseCommissionAmount("120000")).toBe(120000);
      expect(parseCommissionAmount(45000)).toBe(45000);
      expect(parseCommissionAmount(null)).toBeNull();
      expect(parseCommissionAmount("unknown")).toBeNull();
    });
  });

  describe("Product Normalizer", () => {
    it("normalizes complete valid product offer", () => {
      const result = normalizeRawProductOffer({
        externalProductId: "12345",
        shopId: "999",
        title: " Áo Khoác Dù Nam Nữ Unisex 2 Lớp Chống Nước ",
        category: "Thời Trang Nam",
        productUrl: "https://shopee.vn/ao-khoac-i.999.12345",
        affiliateUrl: "https://s.shopee.vn/abcdef",
        imageUrl: "https://cf.shopee.vn/image.jpg",
        commissionRate: "14%",
        commissionAmount: "35.000₫",
        soldCount: "Đã bán 3.4k",
      });

      expect(result.externalProductId).toBe("12345");
      expect(result.shopId).toBe("999");
      expect(result.title).toBe("Áo Khoác Dù Nam Nữ Unisex 2 Lớp Chống Nước");
      expect(result.category).toBe("Thời Trang Nam");
      expect(result.commissionRate).toBe(14);
      expect(result.commissionAmount).toBe(35000);
      expect(result.soldCount).toBe(3400);
      expect(result.currency).toBe("VND");
      expect(result.source).toBe("SHOPEE_SESSION_WORKER");
      expect(result.capturedAt).toBeDefined();
    });

    it("preserves nulls when optional fields are missing without inventing data", () => {
      const result = normalizeRawProductOffer({
        title: "Bàn Phím Cơ Không Dây",
        productUrl: "https://shopee.vn/ban-phim-co",
        affiliateUrl: "https://s.shopee.vn/xyz123",
      });

      expect(result.externalProductId).toBeNull();
      expect(result.shopId).toBeNull();
      expect(result.commissionRate).toBeNull();
      expect(result.commissionAmount).toBeNull();
      expect(result.soldCount).toBeNull();
      expect(result.imageUrl).toBeNull();
    });

    it("throws ZodError on unapproved affiliate URL domain", () => {
      expect(() =>
        normalizeRawProductOffer({
          title: "Sản phẩm test",
          productUrl: "https://shopee.vn/item",
          affiliateUrl: "https://unauthorized-domain.com/link",
        })
      ).toThrow();
    });
  });
});
