export type ThreadArchetype = "REGRET_EXPERIENCE" | "UNPOPULAR_OPINION" | "CURATED_LIST";
export type ThreadNiche = "SKINCARE" | "OFFICE_LIFESTYLE" | "FASHION";

export interface ThreadComposeOptions {
  productName: string;
  category?: string;
  niche?: ThreadNiche;
  archetype?: ThreadArchetype;
  productFeatures?: string[];
  painPoints?: string[];
  personalExperience?: string;
  voucherCode?: string;
  voucherDiscount?: string;
  priceFormatted?: string;
  affiliateUrl: string;
}

export interface ComposedThreadResult {
  mainPost: string;
  firstReply: string;
  archetype: ThreadArchetype;
  niche: ThreadNiche;
  modelUsed: string;
  generatedBy: "GEMINI" | "FALLBACK";
  metadata: {
    wordCount: number;
    hasBannedWords: boolean;
    bannedWordsFound: string[];
    hasDiscussionQuestion: boolean;
    hasVoucher: boolean;
  };
}

export const BANNED_MARKETING_WORDS = [
  "sản phẩm chất lượng vượt trội",
  "mang lại hiệu quả thần kỳ",
  "hãy mua ngay",
  "đừng bỏ lỡ",
  "vô cùng tiện lợi",
  "cam kết chính hãng",
  "nhanh tay kẻo lỡ",
  "hàng đầu hiện nay",
  "giải pháp tối ưu",
  "sản phẩm hoàn hảo",
  "siêu phẩm",
  "cơ hội duy nhất",
] as const;

export const BANNED_BAIT_SOLUTION_WORDS = [
  "chân ái",
  "tìm ra chân ái",
  "tìm ra giải pháp",
  "cứu cánh đời tui",
  "cuộc đời sang trang",
  "đổi sang món này",
  "đã giải quyết được",
  "đã tìm được",
] as const;

/**
 * Strips Shopee SEO junk, promotional tags, brand suffixes, and buzzwords
 * to produce clean, natural conversational product names.
 * E.g. "Chân Váy Kaki Dáng Ngắn Có Lót Trong BigSize Hannako - fashion Cl" -> "chân váy kaki có lót trong"
 */
export function sanitizeProductTitle(rawTitle: string): string {
  if (!rawTitle) return "";

  let title = rawTitle;

  // 1. Remove bracketed promo tags: [Mã BAMS...], (Chính Hãng), 【Hot 2024】, etc.
  title = title.replace(/\[[^\]]*\]/g, " ");
  title = title.replace(/\([^\)]*\)/g, " ");
  title = title.replace(/【[^】]*】/g, " ");
  title = title.replace(/\{[^\}]*\}/g, " ");

  // 2. Remove trailing shop/brand identifiers separated by -, |, /, •
  title = title.split(/\s+[-|/•]\s+/)[0];

  // 3. Remove common Shopee buzzwords and SEO junk (case-insensitive)
  const junkPatterns = [
    /\b(bigsize|oversize|freesize)\b/gi,
    /\b(chính\s*hãng\s*(100%)?|cao\s*cấp|loại\s*1|hàng\s*đẹp|chất\s*lượng\s*cao)\b/gi,
    /\b(hot\s*trend|trend\s*20\d\d|mới\s*nhất|hot\s*20\d\d)\b/gi,
    /\b(giá\s*rẻ|freeship\s*extra|freeship|giảm\s*giá|sale\s*sốc|xả\s*kho)\b/gi,
    /\b(fullbox|nhập\s*khẩu|xuất\s*khẩu)\b/gi,
    /\b(combo\s*\d+|set\s*\d+\s*món)\b/gi,
    /\b(hannako|shopee|lazada|tiktok)\b/gi,
  ];

  for (const pattern of junkPatterns) {
    title = title.replace(pattern, " ");
  }

  // 4. Remove standalone SKU/model codes or hashtags (e.g. #123, No.01, SKU8892)
  title = title.replace(/(#\w+|no\.\s*\d+|sku\s*\w+)/gi, " ");

  // 5. Clean punctuation and collapse spaces
  title = title.replace(/[|•_~*^]+/g, " ");
  title = title.replace(/\s+/g, " ").trim();

  // 6. Convert to lowercase for natural conversational Vietnamese insertion
  if (title.length > 0) {
    title = title.toLowerCase();
  }

  return title;
}

/**
 * Automatically infers the most relevant Threads niche (FASHION, OFFICE_LIFESTYLE, SKINCARE)
 * from product category and title keywords to prevent content hallucinations.
 */
export function inferNiche(category?: string, productName?: string): ThreadNiche {
  const combined = `${category || ""} ${productName || ""}`.toLowerCase();

  const fashionKeywords = [
    "áo", "quần", "váy", "đầm", "chân váy", "yếm", "blazer", "hoodie", "cardigan",
    "croptop", "sơ mi", "khoác", "thời trang", "phụ kiện", "túi", "ví", "giày",
    "dép", "sneaker", "boots", "tất", "vớ", "nón", "mũ", "thắt lưng", "trang sức",
    "khuyên tai", "nhẫn", "đồ lót", "đồ ngủ", "pijama", "len", "kaki", "jean",
    "denim", "cột tóc", "kẹp tóc"
  ];

  const officeKeywords = [
    "văn phòng", "bàn làm việc", "ghế", "công thái học", "gia dụng", "gối", "đệm",
    "kê lưng", "kê cổ", "bình giữ nhiệt", "cốc", "ly", "đèn", "kệ", "lót chuột",
    "bàn phím", "chuột", "tai nghe", "giá đỡ", "sổ", "bút", "tiện ích", "nhà cửa",
    "decor", "hộp cơm", "trà"
  ];

  const skincareKeywords = [
    "skincare", "mỹ phẩm", "da", "mụn", "trị mụn", "phục hồi", "kem", "serum",
    "toner", "nước hoa hồng", "chống nắng", "dưỡng ẩm", "sữa rửa mặt", "tẩy trang",
    "tẩy tế bào chết", "son", "phấn", "cushion", "mascara", "makeup", "trang điểm",
    "dầu gội", "sữa tắm", "dưỡng thể", "b5", "retinol", "bha", "aha", "niacinamide",
    "nước tẩy trang", "mặt nạ"
  ];

  let fashionScore = 0;
  for (const kw of fashionKeywords) {
    if (combined.includes(kw)) fashionScore++;
  }

  let officeScore = 0;
  for (const kw of officeKeywords) {
    if (combined.includes(kw)) officeScore++;
  }

  let skincareScore = 0;
  for (const kw of skincareKeywords) {
    if (combined.includes(kw)) skincareScore++;
  }

  if (fashionScore > officeScore && fashionScore > skincareScore) {
    return "FASHION";
  }
  if (officeScore > fashionScore && officeScore > skincareScore) {
    return "OFFICE_LIFESTYLE";
  }
  if (skincareScore > fashionScore && skincareScore > officeScore) {
    return "SKINCARE";
  }

  return "SKINCARE";
}

/**
 * Programmatically trims a generated post to stay strictly <= maxChars (default 450 chars)
 * while preserving the concluding interaction question.
 */
export function trimPostLength(text: string, maxChars = 450): string {
  if (!text || text.length <= maxChars) return text;

  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length === 0) return text.slice(0, maxChars);

  const lastPara = paragraphs[paragraphs.length - 1];
  const hasQuestion = lastPara.includes("?");

  let question = hasQuestion ? lastPara : "";
  const bodyParas = hasQuestion ? paragraphs.slice(0, -1) : paragraphs;

  if (question.length > 100) {
    question = question.slice(0, 97) + "...?";
  }

  const maxBodyChars = maxChars - (question ? question.length + 2 : 0);

  let currentBody = "";
  for (const para of bodyParas) {
    const candidate = currentBody ? `${currentBody}\n\n${para}` : para;
    if (candidate.length <= maxBodyChars) {
      currentBody = candidate;
    } else {
      const sentences = para.split(/(?<=[.!?])\s+/);
      for (const sentence of sentences) {
        const sentCandidate = currentBody ? `${currentBody} ${sentence}` : sentence;
        if (sentCandidate.length <= maxBodyChars) {
          currentBody = sentCandidate;
        } else {
          break;
        }
      }
      break;
    }
  }

  if (!currentBody && bodyParas.length > 0) {
    const words = bodyParas[0].split(/\s+/);
    let sliced = "";
    for (const w of words) {
      if ((sliced + " " + w).length <= maxBodyChars - 3) {
        sliced = sliced ? `${sliced} ${w}` : w;
      } else break;
    }
    currentBody = sliced ? `${sliced}...` : bodyParas[0].slice(0, Math.max(10, maxBodyChars - 3)) + "...";
  }

  const finalPost = question ? `${currentBody}\n\n${question}` : currentBody;
  return finalPost.length <= maxChars ? finalPost : finalPost.slice(0, maxChars);
}

/**
 * Scans text for banned marketing buzzwords and calculates word count.
 * When isMainPost is true, also flags premature solution revelations or boasting ("chân ái").
 */
export function validateMarketingContent(text: string, isMainPost = false): {
  hasBannedWords: boolean;
  bannedWordsFound: string[];
  wordCount: number;
} {
  const lower = (text || "").toLowerCase();
  const bannedWordsFound: string[] = [];

  for (const banned of BANNED_MARKETING_WORDS) {
    if (lower.includes(banned.toLowerCase())) {
      bannedWordsFound.push(banned);
    }
  }

  if (isMainPost) {
    for (const baitBanned of BANNED_BAIT_SOLUTION_WORDS) {
      if (lower.includes(baitBanned.toLowerCase())) {
        bannedWordsFound.push(baitBanned);
      }
    }
  }

  const words = (text || "").trim().split(/\s+/).filter(Boolean);

  return {
    hasBannedWords: bannedWordsFound.length > 0,
    bannedWordsFound,
    wordCount: words.length,
  };
}
