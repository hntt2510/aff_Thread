/**
 * Product Relevance Evaluator Contract and Baseline Deterministic Implementation.
 * Evaluates topical and semantic affinity between a Threads post and candidate products.
 * Does not pretend to be artificial intelligence; uses deterministic token/keyword and category matching.
 */

export interface ProductRelevanceContext {
  postText: string;
  accountNiche?: string | null;
}

export interface ProductRelevanceCandidate {
  id: string;
  title: string;
  normalizedTitle?: string | null;
  category?: string | null;
}

export interface ProductRelevanceResult {
  score: number; // 0–100
  matchedKeywords: string[];
  categoryMatch: boolean;
  explanation: string;
  method: string;
  confidence: number;
}

export interface ProductRelevanceEvaluator {
  id: string;
  version: string;
  evaluate(
    context: ProductRelevanceContext,
    candidate: ProductRelevanceCandidate
  ): ProductRelevanceResult;
}

/**
 * Normalizes Vietnamese text for keyword matching by stripping diacritics and special characters.
 */
export function normalizeVietnameseText(str: string): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Common Vietnamese stop words to filter out from token analysis.
 */
const STOP_WORDS = new Set([
  "la", "va", "cua", "cho", "co", "o", "trong", "tren", "voi", "nhu", "duoc",
  "khi", "neu", "thi", "de", "cac", "nhung", "mot", "nay", "do", "kia",
  "rat", "qua", "lam", "ve", "ra", "vao", "ngay", "luc", "den", "tu", "minh",
  "ban", "nguoi", "em", "anh", "chi", "nhe", "nha", "ne", "nhi", "a", "day",
  "khong", "chua", "se", "da", "di", "roi", "luon",
]);

export class DeterministicKeywordRelevanceEvaluator implements ProductRelevanceEvaluator {
  readonly id = "deterministic-keyword-v1";
  readonly version = "v1.0.0";

  evaluate(
    context: ProductRelevanceContext,
    candidate: ProductRelevanceCandidate
  ): ProductRelevanceResult {
    const postNorm = normalizeVietnameseText(context.postText);
    const postTokens = new Set(
      postNorm
        .split(" ")
        .map((t) => t.trim())
        .filter((t) => t.length >= 2 && !STOP_WORDS.has(t))
    );

    const titleNorm = normalizeVietnameseText(candidate.title);
    const titleTokens = titleNorm
      .split(" ")
      .map((t) => t.trim())
      .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));

    const matchedKeywords: string[] = [];
    for (const token of titleTokens) {
      if (postTokens.has(token) && !matchedKeywords.includes(token)) {
        matchedKeywords.push(token);
      }
    }

    // Check category match
    let categoryMatch = false;
    if (candidate.category) {
      const categoryNorm = normalizeVietnameseText(candidate.category);
      const catTokens = categoryNorm.split(" ").filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
      categoryMatch = catTokens.some((ct) => postTokens.has(ct));
    }

    // Score calculation
    let score = 0;
    if (matchedKeywords.length >= 4) {
      score = 90;
    } else if (matchedKeywords.length === 3) {
      score = 75;
    } else if (matchedKeywords.length === 2) {
      score = 55;
    } else if (matchedKeywords.length === 1) {
      score = 35;
    } else {
      score = 10; // Baseline candidate score
    }

    if (categoryMatch) {
      score = Math.min(100, score + 15);
    }

    const explanation = `Relevance: ${score}/100 | Method: ${this.id} | Matched: [${matchedKeywords.join(
      ", "
    )}] | Category Match: ${categoryMatch ? "YES" : "NO"}`;

    return {
      score,
      matchedKeywords,
      categoryMatch,
      explanation,
      method: this.id,
      confidence: matchedKeywords.length > 0 ? 0.85 : 0.4,
    };
  }
}

export const deterministicRelevanceEvaluator = new DeterministicKeywordRelevanceEvaluator();
