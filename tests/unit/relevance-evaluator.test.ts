import { describe, it, expect } from "vitest";
import {
  deterministicRelevanceEvaluator,
  normalizeVietnameseText,
} from "@/services/shopee/relevance-evaluator.service";

describe("ProductRelevanceEvaluator (Deterministic Keyword)", () => {
  it("normalizes Vietnamese diacritics and symbols properly", () => {
    const raw = "Áo Thun Nam Cổ Tròn Cotton 100% Co Giãn!";
    const norm = normalizeVietnameseText(raw);
    expect(norm).toBe("ao thun nam co tron cotton 100 co gian");
  });

  it("matches keywords between post text and candidate title", () => {
    const postText = "Mọi người hỏi link áo thun cotton mặc mát mùa hè này nhiều quá, mình để ở đây nhé!";
    const candidate = {
      id: "p1",
      title: "Áo thun cotton unisex form rộng thoáng mát",
      category: "Thời trang nam",
    };

    const res = deterministicRelevanceEvaluator.evaluate({ postText }, candidate);

    expect(res.score).toBeGreaterThanOrEqual(70);
    expect(res.matchedKeywords).toContain("ao");
    expect(res.matchedKeywords).toContain("thun");
    expect(res.matchedKeywords).toContain("cotton");
    expect(res.matchedKeywords).toContain("mat");
    expect(res.method).toBe("deterministic-keyword-v1");
  });

  it("returns baseline score when no keywords match", () => {
    const postText = "Hôm nay trời mưa to quá không đi làm được!";
    const candidate = {
      id: "p2",
      title: "Nồi chiên không dầu điện tử cao cấp",
      category: "Gia dụng",
    };

    const res = deterministicRelevanceEvaluator.evaluate({ postText }, candidate);

    expect(res.score).toBe(10);
    expect(res.matchedKeywords.length).toBe(0);
    expect(res.categoryMatch).toBe(false);
  });
});
