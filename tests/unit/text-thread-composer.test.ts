import { describe, it, expect } from "vitest";
import {
  TextThreadComposerService,
  sanitizeProductTitle,
  inferNiche,
  BANNED_MARKETING_WORDS,
  type ThreadArchetype,
  type ThreadNiche,
} from "@/services/threads/text-thread-composer.service";

describe("TextThreadComposerService - Product Sanitization & Niche Inference", () => {
  it("sanitizes Shopee SEO tags, brand suffixes, and buzzwords cleanly", () => {
    const raw1 = "Chân Váy Kaki Dáng Ngắn Có Lót Trong BigSize Hannako - fashion Cl";
    const clean1 = sanitizeProductTitle(raw1);
    expect(clean1).toBe("chân váy kaki dáng ngắn có lót trong");

    const raw2 = "[Mã BAMS50 giảm 50k] Serum Phục Hồi B5 La Roche-Posay 30ml - Chính Hãng 100%";
    const clean2 = sanitizeProductTitle(raw2);
    expect(clean2).toContain("serum phục hồi b5");
    expect(clean2).not.toContain("mã bams50");
    expect(clean2).not.toContain("chính hãng");

    const raw3 = "Đệm Kê Lưng Công Thái Học Cao Cấp Chống Đau Mỏi Cột Sống | Shop Mall Official";
    const clean3 = sanitizeProductTitle(raw3);
    expect(clean3).toBe("đệm kê lưng công thái học chống đau mỏi cột sống");
  });

  it("infers niches accurately based on category and title keywords", () => {
    expect(inferNiche("Thời trang nữ", "Chân váy chữ A")).toBe("FASHION");
    expect(inferNiche("Quần áo", "Áo thun polo unisex")).toBe("FASHION");
    expect(inferNiche("Văn phòng phẩm & Tiện ích", "Gối tựa lưng công thái học")).toBe("OFFICE_LIFESTYLE");
    expect(inferNiche("Gia dụng", "Bình giữ nhiệt 800ml")).toBe("OFFICE_LIFESTYLE");
    expect(inferNiche("Chăm sóc da mặt", "Kem chống nắng kiềm dầu")).toBe("SKINCARE");
    expect(inferNiche("", "Serum trị mụn phục hồi B5")).toBe("SKINCARE");
  });
});

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

  it("flags premature solution reveals and chân ái when isMainPost is true", () => {
    const revealingBait =
      "Nói thật trước đây da tui xấu lắm, vậy mà giờ tui mới tìm ra chân ái cứu cánh đời tui!";
    const result = service.validateContent(revealingBait, true);

    expect(result.hasBannedWords).toBe(true);
    expect(result.bannedWordsFound).toContain("chân ái");
    expect(result.bannedWordsFound).toContain("cứu cánh đời tui");
  });
});

describe("TextThreadComposerService - 450-Char Limit & Trimming", () => {
  const service = new TextThreadComposerService();

  it("trims long posts > 450 chars down while preserving the concluding question", () => {
    const longText = "Đoạn văn này rất dài để thử nghiệm thuật toán cắt tỉa ký tự của hệ thống Threads Composer. "
      .repeat(8) + "\n\nTrong này có ai từng bị cảnh này giống tui khum?";

    expect(longText.length).toBeGreaterThan(500);

    const trimmed = service.trimPostLength(longText, 450);
    expect(trimmed.length).toBeLessThanOrEqual(450);
    expect(trimmed.trim().endsWith("?")).toBe(true);
    expect(trimmed).toContain("Trong này có ai từng bị cảnh này giống tui khum?");
  });
});

describe("TextThreadComposerService - Deterministic Fallback Generation", () => {
  const service = new TextThreadComposerService();
  const archetypes: ThreadArchetype[] = ["REGRET_EXPERIENCE", "UNPOPULAR_OPINION", "CURATED_LIST"];
  const niches: ThreadNiche[] = ["SKINCARE", "OFFICE_LIFESTYLE", "FASHION"];

  for (const arch of archetypes) {
    for (const niche of niches) {
      it(`generates compliant fallback strictly <= 450 chars for archetype=${arch}, niche=${niche}`, () => {
        const dummyProduct = "Chân Váy Kaki Dáng Ngắn Có Lót Trong BigSize Hannako - fashion Cl";
        const dummyUrl = "https://s.shopee.vn/test12345";
        const voucherCode = "SHOPEE50K";
        const voucherDiscount = "50k";
        const priceFormatted = "199.000đ";

        const fallback = service.generateDeterministicFallback({
          productName: dummyProduct,
          affiliateUrl: dummyUrl,
          archetype: arch,
          niche,
          voucherCode,
          voucherDiscount,
          priceFormatted,
        });

        // 1. Meta Threads strict hard limit (<= 450 chars)
        expect(fallback.mainPost.length).toBeLessThanOrEqual(450);
        expect(fallback.mainPost.length).toBeGreaterThanOrEqual(250);

        // 2. Engagement discussion question at the end
        expect(fallback.mainPost.trim().endsWith("?")).toBe(true);

        // 3. Main post MUST NOT leak raw product name or affiliate URL
        expect(fallback.mainPost.toLowerCase()).not.toContain("chân váy kaki dáng ngắn có lót trong");
        expect(fallback.mainPost).not.toContain(dummyUrl);

        // 4. Main post has NO banned marketing words and NO premature solution reveals ("chân ái")
        const validation = service.validateContent(fallback.mainPost, true);
        expect(validation.hasBannedWords).toBe(false);
        expect(fallback.mainPost.toLowerCase()).not.toContain("chân ái");
        expect(fallback.mainPost.toLowerCase()).not.toContain("tìm ra giải pháp");
        expect(fallback.mainPost.toLowerCase()).not.toContain("cuộc đời sang trang");

        // 5. First reply reveals sanitized product name with returning author hook
        expect(fallback.firstReply).toContain("U là trời, biết ngay mng sẽ hỏi mà!");
        expect(fallback.firstReply).toContain("chân váy kaki dáng ngắn có lót trong");
        expect(fallback.firstReply).not.toContain("BigSize Hannako - fashion Cl");
        expect(fallback.firstReply).toContain(dummyUrl);
        expect(fallback.firstReply).toContain("🎟️ Mã shop: SHOPEE50K");
        expect(fallback.firstReply).toContain("giảm 50k");
        expect(fallback.firstReply).toContain("💵 Giá tham khảo: ~199.000đ");
        expect(fallback.firstReply.length).toBeLessThanOrEqual(500);
      });
    }
  }
});

describe("TextThreadComposerService - Full Composition Workflow", () => {
  const service = new TextThreadComposerService();

  it("auto-aligns niche when product category contradicts user selection (prevents skincare for clothing)", async () => {
    const prevKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    // User mistakenly set niche: "SKINCARE" for a Fashion skirt
    const result = await service.composeThread({
      productName: "Chân Váy Kaki Dáng Ngắn Có Lót Trong BigSize Hannako - fashion Cl",
      category: "Thời trang nữ",
      affiliateUrl: "https://s.shopee.vn/fashion_skirt",
      archetype: "REGRET_EXPERIENCE",
      niche: "SKINCARE",
    });

    expect(result.generatedBy).toBe("FALLBACK");
    // Niche must be auto-aligned to FASHION!
    expect(result.niche).toBe("FASHION");
    expect(result.mainPost.length).toBeLessThanOrEqual(450);
    // Main post must talk about clothing/outfits, NOT skin or acne
    expect(result.mainPost.toLowerCase()).not.toContain("mụn");
    expect(result.mainPost.toLowerCase()).not.toContain("serum");
    expect(result.firstReply).toContain("chân váy kaki dáng ngắn có lót trong");

    if (prevKey) process.env.GEMINI_API_KEY = prevKey;
  });
});
