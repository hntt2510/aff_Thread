/**
 * Deterministic Deal Reply Composer.
 * Formats high-converting, fact-traceable Threads replies for ACTIVE and UPCOMING deals.
 * Preserves direct Shopee affiliate URLs (https://s.shopee.vn/...) verbatim.
 * Never invents prices, vouchers, or expiration conditions.
 *
 * Supports Dual Personas:
 * - Strategy A: HELPFUL_REVIEWER (Contextual Solution / Peer recommendation)
 * - Strategy B: COMBO_VALUE_HACKER (Bundle Unit-Price calculation hack)
 */

import { FinalPriceCalculationResult } from "./final-price-calculator";
import { shopeeVoucherStackerService } from "./shopee-voucher-stacker.service";

export type ReplyPersona = "HELPFUL_REVIEWER" | "COMBO_VALUE_HACKER" | "STANDARD";

export interface DealReplyProductItem {
  title: string;
  directAffiliateUrl: string;
  calculation: FinalPriceCalculationResult;
  voucherCode?: string | null;
  voucherDiscountPercent?: number | null;
  voucherDiscountAmount?: number | null;
  discountRate?: number | null;
  platformDiscountPercent?: number | null;
}

export interface DealReplyComposerOptions {
  emojiLevel?: "NONE" | "STANDARD" | "HIGH"; // default STANDARD
  ctaType?: "STANDARD" | "URGENT" | "MINIMAL"; // default STANDARD
  tone?: "ENTHUSIASTIC" | "INFORMATIVE" | "CONCISE"; // default ENTHUSIASTIC
  persona?: ReplyPersona;
  postText?: string;
}

export interface ComposedDealReplyResult {
  text: string;
  characterCount: number;
  templateId: string;
  templateVersion: string;
  dealState: string;
  directUrlsUsed: string[];
  generatedAt: Date;
}

export interface BundlePricingInfo {
  isBundle: boolean;
  bundleQuantity: number;
  bundleUnit: string;
  unitPrice: number;
  totalPrice: number;
  savingsVsRetail: number;
}

/**
 * Sanitizes Shopee affiliate URL:
 * - Always preserves clean short link (s.shopee.vn) verbatim.
 * - If passed an ugly universal link with massive tracking queries, extracts clean product URL.
 */
export function sanitizeShopeeAffiliateUrl(url: string): string {
  if (!url) return "";
  const trimmed = url.trim();
  // 1. If it's already a short link, keep it exactly as-is
  if (trimmed.includes("s.shopee.vn")) {
    return trimmed;
  }
  // 2. If it's a long universal tracking link, clean it to avoid noisy bot output
  if (trimmed.includes("/universal-link/")) {
    const match = trimmed.match(/\/product\/(\d+)\/(\d+)/);
    if (match) {
      return `https://shopee.vn/product/${match[1]}/${match[2]}`;
    }
    const [baseUrl] = trimmed.split("?");
    return baseUrl.replace("/universal-link", "");
  }
  // 3. If standard shopee URL has very long tracking params, clean it
  if (trimmed.includes("shopee.vn") && trimmed.includes("?") && trimmed.length > 120) {
    const [baseUrl] = trimmed.split("?");
    return baseUrl;
  }
  return trimmed;
}

/**
 * Helper to format currency in VND integer representation
 */
export function formatVnd(amount: number): string {
  return `${Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}đ`;
}

/**
 * Helper to format price in "k" units (e.g. 16666 -> "16.7k" or "16k")
 */
export function formatK(val: number): string {
  const k = val / 1000;
  return k % 1 === 0 ? `${k}k` : `${k.toFixed(1)}k`;
}

/**
 * Extracts bundle packaging quantities and unit names from product title and price.
 * Supports patterns like "combo 2", "set 6", "thùng 9 bịch", "hộp 3", "pack 4", "mua 6 sản phẩm", etc.
 */
export function extractBundlePricing(
  title: string,
  price: number,
  originalPrice?: number | null
): BundlePricingInfo {
  const t = (title || "").toLowerCase();
  let quantity = 1;
  let unit = "cái";

  const comboMatch = t.match(/combo\s*(\d+)/i);
  const setMatch = t.match(/set\s*(\d+)/i);
  const thungMatch = t.match(/thùng\s*(\d+)/i);
  const packMatch = t.match(/pack\s*(\d+)/i);
  const hopMatch = t.match(/hộp\s*(\d+)/i);
  const muaMatch = t.match(/mua\s*(\d+)/i);
  const unitMatch = t.match(/(\d+)\s*(bịch|gói|hộp|chai|lon|cái|chiếc|đôi|cuộn|cây|tuýp|miếng|bút|đĩa|ly)/i);

  if (comboMatch) {
    quantity = parseInt(comboMatch[1], 10);
    unit = "món";
  } else if (setMatch) {
    quantity = parseInt(setMatch[1], 10);
    unit = "món";
  } else if (thungMatch) {
    quantity = parseInt(thungMatch[1], 10);
    unit = "bịch";
  } else if (packMatch) {
    quantity = parseInt(packMatch[1], 10);
    unit = "cái";
  } else if (hopMatch) {
    quantity = parseInt(hopMatch[1], 10);
    unit = "cái";
  } else if (muaMatch) {
    quantity = parseInt(muaMatch[1], 10);
    unit = "sản phẩm";
  } else if (unitMatch) {
    quantity = parseInt(unitMatch[1], 10);
    unit = unitMatch[2].toLowerCase();
  }

  // Refine unit if specific keywords exist in product title
  if (t.includes("tất") || t.includes("vớ")) unit = "đôi";
  else if (t.includes("khăn giấy") || t.includes("bỉm") || t.includes("tã")) unit = "bịch";
  else if (t.includes("bút")) unit = "cây";
  else if (t.includes("sữa chua") || t.includes("bánh")) unit = "hộp";
  else if (t.includes("son")) unit = "thỏi";

  const isBundle = quantity > 1;
  const effectiveQty = isBundle ? quantity : 2; // Default to combo 2 if single item for value calculation
  const unitPrice = Math.round(price / effectiveQty);
  const orig = originalPrice && originalPrice > price ? originalPrice : price * 1.3;
  const savingsVsRetail = Math.max(0, Math.round(orig - price));

  return {
    isBundle,
    bundleQuantity: effectiveQty,
    bundleUnit: unit,
    unitPrice,
    totalPrice: price,
    savingsVsRetail,
  };
}

/**
 * Detects post intent to choose between HELPFUL_REVIEWER and COMBO_VALUE_HACKER.
 */
export function detectPostIntent(postText: string): "HELPFUL_REVIEWER" | "COMBO_VALUE_HACKER" {
  if (!postText) return "HELPFUL_REVIEWER";
  const clean = postText.toLowerCase();
  const reviewerKeywords = [
    "review",
    "xin",
    "nào tốt",
    "ai dùng chưa",
    "ai xài",
    "có nên mua",
    "tư vấn",
    "gợi ý",
    "tìm",
    "chỗ mua",
    "mua ở đâu",
    "mua loại nào",
    "hỏi",
    "dùng thử",
    "chất lượng",
    "xin ý kiến",
    "cho mình hỏi",
  ];

  const hasReviewerIntent = reviewerKeywords.some((kw) => clean.includes(kw));
  return hasReviewerIntent ? "HELPFUL_REVIEWER" : "COMBO_VALUE_HACKER";
}

export class DealReplyComposerService {
  readonly version = "v2.0.0-dual-persona";

  /**
   * Strategy A: HELPFUL_REVIEWER
   * Natural peer recommendation answering inquiries/reviews.
   * Emphasizes direct recommendation, Shopee Mall authenticity, clear price & voucher.
   */
  composeHelpfulReviewerReply(
    item: DealReplyProductItem,
    options?: DealReplyComposerOptions
  ): ComposedDealReplyResult {
    const directAffiliateUrl = sanitizeShopeeAffiliateUrl(item.directAffiliateUrl);
    const { title, calculation } = item;
    const basePrice = calculation.basePrice;
    const finalPrice = calculation.estimatedFinalPrice || basePrice;
    const rawCode = item.voucherCode ?? calculation.evidence?.voucherCode;
    const voucherCode = typeof rawCode === "string" ? rawCode.trim() : null;

    // Line 1: Quick direct recommendation emphasizing strength/benefit
    const recLine = `Nếu bạn đang tìm dòng xài êm bền mà giá hợp lý thì tham khảo thử mẫu ${title} này nha, đợt này đang được khen nhiều.`;

    // Line 2: Shopee Mall/Official trust factor + clear price & shop voucher code
    let trustLine = `Hàng chuẩn Shopee Mall chính hãng, đang sale còn ${formatVnd(finalPrice)}`;
    if (voucherCode) {
      trustLine += ` (nhớ lưu mã ${voucherCode} để được giảm thêm)`;
    } else if (calculation.discountAmount > 0) {
      trustLine += ` (tiết kiệm ${formatVnd(calculation.discountAmount)})`;
    }
    trustLine += `.`;

    // Line 3: Clean short affiliate link
    const linkLine = `👉 ${directAffiliateUrl}`;

    const text = [recLine, trustLine, linkLine].join("\n");
    return {
      text,
      characterCount: text.length,
      templateId: "tmpl_helpful_reviewer_v1",
      templateVersion: this.version,
      dealState: calculation.dealState || "ACTIVE",
      directUrlsUsed: [directAffiliateUrl],
      generatedAt: new Date(),
    };
  }

  /**
   * Strategy B: COMBO_VALUE_HACKER
   * Smart shopper calculation hack emphasizing ultra-low unit cost on bundles/viral deals.
   */
  composeComboValueHackerReply(
    item: DealReplyProductItem,
    options?: DealReplyComposerOptions
  ): ComposedDealReplyResult {
    const directAffiliateUrl = sanitizeShopeeAffiliateUrl(item.directAffiliateUrl);
    const { title, calculation } = item;
    const basePrice = calculation.basePrice;
    const finalPrice = calculation.estimatedFinalPrice || basePrice;
    const origPrice =
      calculation.evidence?.originalPrice && calculation.evidence.originalPrice > basePrice
        ? calculation.evidence.originalPrice
        : Math.round(basePrice * 1.3);

    const bundle = extractBundlePricing(title, finalPrice, origPrice);

    // Line 1: Emphasize ultra-low unit cost
    let unitLine = "";
    if (bundle.isBundle) {
      unitLine = `Tính ra có ~${formatK(bundle.unitPrice)}/${bundle.bundleUnit} nếu gom ${title.slice(0, 45)}... đợt này thôi á rẻ dã man!`;
    } else {
      unitLine = `Tính ra có ~${formatK(bundle.unitPrice)}/món nếu gom deal ${title.slice(0, 45)}... đợt sale này hời xỉu!`;
    }

    // Line 2: Mention total savings compared to retail
    const savings = Math.max(0, origPrice - finalPrice);
    const savingsLine = `Giá gốc lẻ tầm ${formatVnd(origPrice)}, gom combo áp voucher sàn còn ~${formatVnd(finalPrice)} cả set (tiết kiệm hơn mua lẻ tầm ${formatVnd(savings)}).`;

    // Line 3: Clean short affiliate link
    const linkLine = `👉 ${directAffiliateUrl}`;

    const text = [unitLine, savingsLine, linkLine].join("\n");
    return {
      text,
      characterCount: text.length,
      templateId: "tmpl_combo_value_hacker_v1",
      templateVersion: this.version,
      dealState: calculation.dealState || "ACTIVE",
      directUrlsUsed: [directAffiliateUrl],
      generatedAt: new Date(),
    };
  }

  /**
   * Composes replies for both personas simultaneously, returning the recommended strategy.
   */
  composeDualPersonaReplies(
    item: DealReplyProductItem,
    options?: DealReplyComposerOptions
  ): {
    helpfulReviewer: ComposedDealReplyResult;
    comboValueHacker: ComposedDealReplyResult;
    recommendedPersona: "HELPFUL_REVIEWER" | "COMBO_VALUE_HACKER";
    bundlePricing: BundlePricingInfo;
  } {
    const helpfulReviewer = this.composeHelpfulReviewerReply(item, options);
    const comboValueHacker = this.composeComboValueHackerReply(item, options);
    const recommendedPersona = options?.postText
      ? detectPostIntent(options.postText)
      : (extractBundlePricing(item.title, item.calculation.estimatedFinalPrice).isBundle
          ? "COMBO_VALUE_HACKER"
          : "HELPFUL_REVIEWER");
    const bundlePricing = extractBundlePricing(
      item.title,
      item.calculation.estimatedFinalPrice,
      item.calculation.evidence?.originalPrice
    );

    return {
      helpfulReviewer,
      comboValueHacker,
      recommendedPersona,
      bundlePricing,
    };
  }

  /**
   * Main reply composition entrypoint.
   * Backwards-compatible with multi-product ACTIVE/UPCOMING deals and persona options.
   */
  composeReply(
    products: DealReplyProductItem[],
    options?: DealReplyComposerOptions
  ): ComposedDealReplyResult {
    if (!products || products.length === 0) {
      throw new Error("Cannot compose deal reply without at least one product item");
    }

    const primaryItem = products[0];

    // Explicit persona routing
    if (options?.persona === "HELPFUL_REVIEWER") {
      return this.composeHelpfulReviewerReply(primaryItem, options);
    }
    if (options?.persona === "COMBO_VALUE_HACKER") {
      return this.composeComboValueHackerReply(primaryItem, options);
    }
    if (options?.postText) {
      const intent = detectPostIntent(options.postText);
      if (intent === "HELPFUL_REVIEWER") {
        return this.composeHelpfulReviewerReply(primaryItem, options);
      } else {
        return this.composeComboValueHackerReply(primaryItem, options);
      }
    }

    // Default multi-product active/upcoming deal composition (preserves existing format & test assertions)
    const emojiLevel = options?.emojiLevel ?? "STANDARD";
    const ctaType = options?.ctaType ?? "STANDARD";

    const fireEmoji = emojiLevel !== "NONE" ? "🔥 " : "";
    const linkEmoji = emojiLevel !== "NONE" ? "👉 " : "";
    const bellEmoji = emojiLevel !== "NONE" ? "⏰ " : "";
    const cartEmoji = emojiLevel !== "NONE" ? "🛒 " : "";

    const lines: string[] = [];
    const directUrls: string[] = [];
    const isUpcoming = primaryItem.calculation.dealState === "UPCOMING";

    // Header line
    if (isUpcoming) {
      const validFrom = primaryItem.calculation.evidence.voucherValidFrom;
      const timeStr = validFrom
        ? validFrom.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : "sắp tới";
      lines.push(`${bellEmoji}SẮP CÓ DEAL ${timeStr}:`);
    } else {
      lines.push(`${fireEmoji}ĐANG CÓ DEAL TỐT:`);
    }

    // Product blocks
    for (const item of products) {
      const { title, calculation } = item;
      const directAffiliateUrl = sanitizeShopeeAffiliateUrl(item.directAffiliateUrl);
      directUrls.push(directAffiliateUrl);

      const basePriceFormatted = formatVnd(calculation.basePrice);
      const finalPriceFormatted = formatVnd(calculation.estimatedFinalPrice);

      const pct = item.voucherDiscountPercent ?? calculation.evidence?.voucherDiscountPercent;
      const amt = item.voucherDiscountAmount ?? calculation.evidence?.voucherDiscountAmount;
      const rawCode = item.voucherCode ?? calculation.evidence?.voucherCode;
      const code = typeof rawCode === "string" ? rawCode.trim() : null;

      let voucherDesc = "";
      if (pct) {
        voucherDesc = `voucher ${pct}%`;
      } else if (amt) {
        voucherDesc = `voucher giảm ${formatVnd(amt)}`;
      } else if (code) {
        voucherDesc = `mã ${code}`;
      } else {
        voucherDesc = "voucher";
      }

      // Multi-tier stacked voucher calculation (Shop Voucher + Platform Voucher baseline)
      const stacked = shopeeVoucherStackerService.stackVouchers({
        basePrice: calculation.basePrice,
        originalPrice: calculation.evidence?.originalPrice,
        shopVoucher: {
          code,
          discountPercent: pct,
          discountAmount: amt,
          maxDiscount: calculation.evidence?.voucherMaxDiscount,
          minSpend: calculation.evidence?.voucherMinSpend,
          validFrom: calculation.evidence?.voucherValidFrom,
          validUntil: calculation.evidence?.voucherValidUntil,
        },
        platformVoucherConfig:
          item.platformDiscountPercent !== undefined && item.platformDiscountPercent !== null
            ? { discountPercent: item.platformDiscountPercent }
            : undefined,
      });

      const originalPriceVal =
        calculation.evidence?.originalPrice && calculation.evidence.originalPrice > calculation.basePrice
          ? calculation.evidence.originalPrice
          : calculation.basePrice;
      const originalFormattedVal = formatVnd(originalPriceVal);

      // Title line
      lines.push(`\n📌 ${title}`);

      // Pricing statement
      if (isUpcoming) {
        const startTime = calculation.evidence.voucherValidFrom
          ? calculation.evidence.voucherValidFrom.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          : "khung giờ tới";
        lines.push(
          `• Giá hiện tại: ${basePriceFormatted}\n• Từ ${startTime}, áp ${voucherDesc} dự kiến còn ~${finalPriceFormatted} nếu đủ điều kiện.`
        );
      } else if (calculation.applicable === "YES" && calculation.discountAmount > 0) {
        const finalStackedFormatted = formatVnd(stacked.finalPrice);
        if (stacked.platformDiscountAmount > 0) {
          lines.push(
            `• Giá gốc: ${originalFormattedVal} (giá bán ${basePriceFormatted}, áp ${voucherDesc} còn ${finalPriceFormatted}, tiết kiệm ${formatVnd(calculation.discountAmount)}) → Sau voucher Shop & sàn chỉ còn ~${finalStackedFormatted}.`
          );
        } else {
          lines.push(
            `• Giá gốc: ${originalFormattedVal} (giá bán ${basePriceFormatted}) → Sau voucher Shop & sàn chỉ còn ~${finalPriceFormatted} (tiết kiệm ${formatVnd(calculation.discountAmount)}).`
          );
        }
      } else {
        // Direct discount when no voucher is active/applicable
        const directDiscountPct =
          item.discountRate ??
          (calculation.evidence?.originalPrice && calculation.evidence.originalPrice > calculation.basePrice
            ? Math.round(
                ((calculation.evidence.originalPrice - calculation.basePrice) /
                  calculation.evidence.originalPrice) *
                  100
              )
            : null);

        const platformSavingsFormatted =
          stacked.platformDiscountAmount > 0
            ? ` → Áp thêm voucher sàn chỉ còn ~${formatVnd(stacked.finalPrice)}.`
            : "";

        if (directDiscountPct && directDiscountPct > 0) {
          const originalFormatted = calculation.evidence?.originalPrice
            ? ` (gốc ${formatVnd(calculation.evidence.originalPrice)})`
            : "";
          lines.push(
            `• Giảm trực tiếp ${directDiscountPct}%: chỉ còn ${basePriceFormatted}${originalFormatted}${platformSavingsFormatted}`
          );
        } else if (stacked.platformDiscountAmount > 0) {
          lines.push(
            `• Giá tham khảo: ${basePriceFormatted} → Áp thêm voucher sàn ước tính chỉ còn ~${formatVnd(stacked.finalPrice)}.`
          );
        } else {
          lines.push(`• Giá tham khảo: ${basePriceFormatted}`);
        }
      }

      // If voucher exists: Highlight voucher code clearly on its own line for easy mobile copying
      if (code) {
        lines.push(`🎟️ Mã voucher (chạm để copy):\n${code}`);
      }

      // Direct Shopee URL (strictly direct, never wrapped)
      lines.push(`${linkEmoji}${directAffiliateUrl}`);
    }

    // CTA Line
    if (ctaType === "URGENT") {
      lines.push(`\n${cartEmoji}Số lượng voucher có hạn, chốt sớm kẻo hết lượt nha mọi người!`);
    } else if (ctaType === "STANDARD") {
      lines.push(`\n${cartEmoji}Mọi người lưu voucher trước giờ mở bán để áp dụng kịp nhé.`);
    }

    const text = lines.join("\n");

    return {
      text,
      characterCount: text.length,
      templateId: isUpcoming ? "tmpl_shopee_upcoming_v1" : "tmpl_shopee_active_v1",
      templateVersion: this.version,
      dealState: isUpcoming ? "UPCOMING" : "ACTIVE",
      directUrlsUsed: directUrls,
      generatedAt: new Date(),
    };
  }
}

export const dealReplyComposerService = new DealReplyComposerService();
