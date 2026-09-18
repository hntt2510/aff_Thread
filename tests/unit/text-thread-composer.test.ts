import { describe, it, expect } from "vitest";
import {
  TextThreadComposerService,
  BANNED_MARKETING_WORDS,
  type ThreadArchetype,
  type ThreadNiche,
} from "@/services/threads/text-thread-composer.service";

describe("TextThreadComposerService - Content Validation & Ban Filter", () => {
  const service = new TextThreadComposerService();

  it("flags banned marketing buzzwords correctly", () => {
    const roboticText = "Sản phẩm chất lượng vượt trội này mang lại hiệu quả thần kỳ, hãy mua ngay đừng bỏ lỡ!";
    const result = service.validateContent(roboticText);

    expect(result.hasBannedWords).toBe(true);
    expect(result.bannedWordsFound).toContain("sản phẩm chất lượng vượt trội");
    expect(result.bannedWordsFound).toContain("mang lại hiệu quả thần kỳ");
    expect(result.bannedWordsFound).toContain("hãy mua ngay");
    expect(result.bannedWordsFound).toContain("đừng bỏ lỡ");
  });

  it("passes authentic conversational Vietnamese text without buzzwords", () => {
    const authenticText =
      "Nói thật là tui hối hận vì không chịu tìm hiểu vụ này sớm hơn... Mng chia sẻ routine với!";
    const result = service.validateContent(authenticText);

    expect(result.hasBannedWords).toBe(false);
    expect(result.bannedWordsFound).toHaveLength(0);
    expect(result.wordCount).toBeGreaterThan(5);
  });
});

describe("TextThreadComposerService - Deterministic Fallback Generation", () => {
  const service = new TextThreadComposerService();
  const archetypes: ThreadArchetype[] = ["REGRET_EXPERIENCE", "UNPOPULAR_OPINION", "CURATED_LIST"];
  const niches: ThreadNiche[] = ["SKINCARE", "OFFICE_LIFESTYLE", "FASHION"];

  for (const arch of archetypes) {
    for (const niche of niches) {
      it(`generates compliant fallback for archetype=${arch}, niche=${niche}`, () => {
        const dummyProduct = "Kem Dưỡng B5 La Roche-Posay";
        const dummyUrl = "https://s.shopee.vn/test12345";
        const voucherCode = "SHOPEE50K";
        const voucherDiscount = "50k";
        const priceFormatted = "299.000đ";

        const fallback = service.generateDeterministicFallback({
          productName: dummyProduct,
          affiliateUrl: dummyUrl,
          archetype: arch,
          niche,
          voucherCode,
          voucherDiscount,
          priceFormatted,
        });

        // 1. Meta Threads character limit (< 500 chars)
        expect(fallback.mainPost.length).toBeLessThanOrEqual(500);
        expect(fallback.mainPost.length).toBeGreaterThan(50);

        // 2. Engagement discussion question at the end
        expect(fallback.mainPost.trim().endsWith("?")).toBe(true);

        // 3. Main post MUST NOT leak product name or affiliate URL
        expect(fallback.mainPost.toLowerCase()).not.toContain(dummyProduct.toLowerCase());
        expect(fallback.mainPost).not.toContain(dummyUrl);

        // 4. Main post has NO banned marketing words
        const validation = service.validateContent(fallback.mainPost);
        expect(validation.hasBannedWords).toBe(false);

        // 5. First reply reveals product name, voucher, and affiliate link
        expect(fallback.firstReply).toContain(dummyProduct);
        expect(fallback.firstReply).toContain(dummyUrl);
        expect(fallback.firstReply).toContain("🎟️ Mã shop: SHOPEE50K");
        expect(fallback.firstReply).toContain("giảm 50k");
        expect(fallback.firstReply).toContain("💵 Giá tham khảo: ~299.000đ");
        expect(fallback.firstReply.length).toBeLessThanOrEqual(500);
      });
    }
  }
});

describe("TextThreadComposerService - Full Composition Workflow", () => {
  const service = new TextThreadComposerService();

  it("falls back gracefully to deterministic templates when no Gemini key is set", async () => {
    // Ensure no Gemini key in test environment
    const prevKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    const result = await service.composeThread({
      productName: "Đệm Kê Lưng Công Thái Học",
      affiliateUrl: "https://s.shopee.vn/ergonomic_back_support",
      archetype: "REGRET_EXPERIENCE",
      niche: "OFFICE_LIFESTYLE",
      voucherCode: "OFFICE20",
      priceFormatted: "159.000đ",
    });

    expect(result.generatedBy).toBe("FALLBACK");
    expect(result.mainPost).toBeDefined();
    expect(result.mainPost.length).toBeLessThanOrEqual(500);
    expect(result.mainPost.trim().endsWith("?")).toBe(true);
    expect(result.metadata.hasBannedWords).toBe(false);
    expect(result.metadata.hasDiscussionQuestion).toBe(true);
    expect(result.metadata.hasVoucher).toBe(true);
    expect(result.firstReply).toContain("Đệm Kê Lưng Công Thái Học");
    expect(result.firstReply).toContain("https://s.shopee.vn/ergonomic_back_support");

    // Restore
    if (prevKey) process.env.GEMINI_API_KEY = prevKey;
  });
});
