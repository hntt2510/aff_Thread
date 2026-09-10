import { describe, it, expect } from "vitest";
import { dealReplyComposerService } from "@/services/shopee/deal-reply-composer.service";
import { finalPriceCalculator } from "@/services/shopee/final-price-calculator";

describe("DealReplyComposerService", () => {
  it("composes ACTIVE deal reply preserving direct Shopee URL without /r/ redirect", () => {
    const calculation = finalPriceCalculator.calculate({
      observedPrice: 200000,
      voucherDiscountType: "PERCENT",
      voucherDiscountPercent: 20,
    });

    const res = dealReplyComposerService.composeReply([
      {
        title: "Nồi chiên không dầu 5L",
        directAffiliateUrl: "https://s.shopee.vn/abcdef123",
        calculation,
        voucherDiscountPercent: 20,
      },
    ]);

    expect(res.dealState).toBe("ACTIVE");
    expect(res.text).toContain("ĐANG CÓ DEAL TỐT:");
    expect(res.text).toContain("Nồi chiên không dầu 5L");
    expect(res.text).toContain("200.000đ");
    expect(res.text).toContain("160.000đ");
    expect(res.text).toContain("https://s.shopee.vn/abcdef123");
    expect(res.text).not.toContain("/r/");
    expect(res.directUrlsUsed).toContain("https://s.shopee.vn/abcdef123");
  });

  it("composes UPCOMING deal reply with start time and future caveat wording", () => {
    const validFrom = new Date("2026-09-09T12:00:00.000Z");
    const calculation = finalPriceCalculator.calculate({
      observedPrice: 100000,
      voucherDiscountType: "PERCENT",
      voucherDiscountPercent: 30,
      voucherValidFrom: validFrom,
      evaluationTime: new Date("2026-09-09T11:45:00.000Z"),
    });

    const res = dealReplyComposerService.composeReply([
      {
        title: "Son kem lì mịn môi",
        directAffiliateUrl: "https://s.shopee.vn/xyz789",
        calculation,
        voucherDiscountPercent: 30,
      },
    ]);

    expect(res.dealState).toBe("UPCOMING");
    expect(res.text).toContain("SẮP CÓ DEAL");
    expect(res.text).toContain("Son kem lì mịn môi");
    expect(res.text).toContain("Giá hiện tại: 100.000đ");
    expect(res.text).toContain("dự kiến còn ~70.000đ nếu đủ điều kiện");
    expect(res.text).toContain("https://s.shopee.vn/xyz789");
  });

  it("supports multiple products in a single reply", () => {
    const calc1 = finalPriceCalculator.calculate({ observedPrice: 100000, voucherDiscountPercent: 10 });
    const calc2 = finalPriceCalculator.calculate({ observedPrice: 200000, voucherDiscountPercent: 15 });

    const res = dealReplyComposerService.composeReply([
      { title: "Sản phẩm A", directAffiliateUrl: "https://s.shopee.vn/linkA", calculation: calc1 },
      { title: "Sản phẩm B", directAffiliateUrl: "https://s.shopee.vn/linkB", calculation: calc2 },
    ]);

    expect(res.directUrlsUsed.length).toBe(2);
    expect(res.text).toContain("Sản phẩm A");
    expect(res.text).toContain("Sản phẩm B");
    expect(res.text).toContain("https://s.shopee.vn/linkA");
    expect(res.text).toContain("https://s.shopee.vn/linkB");
  });

  it("highlights voucher code on its own standalone line for easy mobile copying", () => {
    const calculation = finalPriceCalculator.calculate({
      observedPrice: 350000,
      voucherCode: "SHOPEE99",
      voucherDiscountType: "PERCENT",
      voucherDiscountPercent: 25,
    });

    const res = dealReplyComposerService.composeReply([
      {
        title: "Bàn chải điện Sonic X",
        directAffiliateUrl: "https://s.shopee.vn/testvoucher1",
        calculation,
        voucherCode: "SHOPEE99",
        voucherDiscountPercent: 25,
      },
    ]);

    expect(res.text).toContain("🎟️ Mã voucher (chạm để copy):\nSHOPEE99");
    expect(res.text).toContain("https://s.shopee.vn/testvoucher1");
    // Verify the code appears strictly on its own line
    const lines = res.text.split("\n");
    expect(lines).toContain("SHOPEE99");
  });

  it("highlights direct discount rate and link when no voucher exists", () => {
    const calculation = finalPriceCalculator.calculate({
      observedPrice: 150000,
      originalPrice: 200000, // 25% discount
    });

    const res = dealReplyComposerService.composeReply([
      {
        title: "Áo thun oversize cotton 100%",
        directAffiliateUrl: "https://s.shopee.vn/directdeal1",
        calculation,
        discountRate: 25,
      },
    ]);

    expect(res.text).toContain("Giảm trực tiếp 25%: chỉ còn 150.000đ");
    expect(res.text).toContain("https://s.shopee.vn/directdeal1");
    expect(res.text).not.toContain("Mã voucher");
  });
});
