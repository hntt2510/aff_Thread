import { describe, it, expect } from "vitest";
import {
  dealReplyComposerService,
  extractBundlePricing,
  detectPostIntent,
} from "@/services/shopee/deal-reply-composer.service";
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

  describe("Strategy A: HELPFUL_REVIEWER Persona", () => {
    it("generates natural peer recommendation emphasizing strength, Shopee Mall trust, price and voucher", () => {
      const calculation = finalPriceCalculator.calculate({
        observedPrice: 320000,
        voucherCode: "TECHMALL20",
        voucherDiscountType: "PERCENT",
        voucherDiscountPercent: 20,
      });

      const res = dealReplyComposerService.composeReply(
        [
          {
            title: "Tai nghe Bluetooth chống ồn SoundCore Life Q30",
            directAffiliateUrl: "https://s.shopee.vn/headphone-review",
            calculation,
            voucherCode: "TECHMALL20",
          },
        ],
        { persona: "HELPFUL_REVIEWER" }
      );

      expect(res.templateId).toBe("tmpl_helpful_reviewer_v1");
      expect(res.text).toContain("Nếu bạn đang tìm dòng xài êm bền");
      expect(res.text).toContain("Tai nghe Bluetooth chống ồn SoundCore Life Q30");
      expect(res.text).toContain("Hàng chuẩn Shopee Mall chính hãng");
      expect(res.text).toContain("TECHMALL20");
      expect(res.text).toContain("https://s.shopee.vn/headphone-review");
    });
  });

  describe("Strategy B: COMBO_VALUE_HACKER Persona", () => {
    it("calculates ultra-low unit cost from bundle title (e.g. Set 6 đôi tất)", () => {
      const calculation = finalPriceCalculator.calculate({
        observedPrice: 99999,
        originalPrice: 150000,
      });

      const res = dealReplyComposerService.composeReply(
        [
          {
            title: "Set 6 đôi tất cổ ngắn cotton kháng khuẩn thoáng khí",
            directAffiliateUrl: "https://s.shopee.vn/combo-socks",
            calculation,
          },
        ],
        { persona: "COMBO_VALUE_HACKER" }
      );

      expect(res.templateId).toBe("tmpl_combo_value_hacker_v1");
      // 99999 / 6 ≈ 16.6k or 16.7k
      expect(res.text).toMatch(/Tính ra có ~\d+(\.\d+)?k\/đôi/);
      expect(res.text).toContain("https://s.shopee.vn/combo-socks");
      expect(res.text).toContain("tiết kiệm hơn mua lẻ");
    });

    it("calculates unit price for bulk cartons (e.g. Thùng 9 bịch khăn giấy)", () => {
      const calculation = finalPriceCalculator.calculate({
        observedPrice: 108000,
        originalPrice: 180000,
      });

      const res = dealReplyComposerService.composeReply(
        [
          {
            title: "Thùng 9 bịch khăn giấy gấu trúc Sipiao 4 lớp dày mịn",
            directAffiliateUrl: "https://s.shopee.vn/tissue-box",
            calculation,
          },
        ],
        { persona: "COMBO_VALUE_HACKER" }
      );

      // 108000 / 9 = 12k/bịch
      expect(res.text).toContain("~12k/bịch");
      expect(res.text).toContain("https://s.shopee.vn/tissue-box");
    });
  });

  describe("Intent Detection and Dual Persona Generator", () => {
    it("detects recommendation inquiry intent accurately", () => {
      expect(detectPostIntent("Mọi người review cho mình mẫu tai nghe chống ồn nào tốt với")).toBe("HELPFUL_REVIEWER");
      expect(detectPostIntent("Xin gợi ý kem chống nắng kiềm dầu cho da mụn")).toBe("HELPFUL_REVIEWER");
      expect(detectPostIntent("Có nên mua robot hút bụi này không mọi người?")).toBe("HELPFUL_REVIEWER");
    });

    it("detects general/viral intent for combo calculation hack", () => {
      expect(detectPostIntent("Hôm nay trời đẹp quá đi dạo phố")).toBe("COMBO_VALUE_HACKER");
      expect(detectPostIntent("Ăn trưa thôi cả nhà ơi")).toBe("COMBO_VALUE_HACKER");
    });

    it("composes dual replies simultaneously with bundle pricing metadata", () => {
      const calculation = finalPriceCalculator.calculate({
        observedPrice: 120000,
        originalPrice: 200000,
      });

      const dual = dealReplyComposerService.composeDualPersonaReplies(
        {
          title: "Combo 3 áo thun trơn basic",
          directAffiliateUrl: "https://s.shopee.vn/combo-tshirt",
          calculation,
        },
        { postText: "Mọi người cho mình xin review áo thun này" }
      );

      expect(dual.recommendedPersona).toBe("HELPFUL_REVIEWER");
      expect(dual.helpfulReviewer.text).toContain("Shopee Mall");
      // 120000 / 3 = 40k
      expect(dual.comboValueHacker.text).toContain("~40k/món");
      expect(dual.bundlePricing.isBundle).toBe(true);
      expect(dual.bundlePricing.bundleQuantity).toBe(3);
      expect(dual.bundlePricing.unitPrice).toBe(40000);
    });
  });
});
