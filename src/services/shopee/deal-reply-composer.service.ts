/**
 * Deterministic Deal Reply Composer.
 * Formats high-converting, fact-traceable Threads replies for ACTIVE and UPCOMING deals.
 * Preserves direct Shopee affiliate URLs (https://s.shopee.vn/...) verbatim.
 * Never invents prices, vouchers, or expiration conditions.
 */

import { FinalPriceCalculationResult } from "./final-price-calculator";

export interface DealReplyProductItem {
  title: string;
  directAffiliateUrl: string;
  calculation: FinalPriceCalculationResult;
  voucherCode?: string | null;
  voucherDiscountPercent?: number | null;
  voucherDiscountAmount?: number | null;
  discountRate?: number | null;
}

export interface DealReplyComposerOptions {
  emojiLevel?: "NONE" | "STANDARD" | "HIGH"; // default STANDARD
  ctaType?: "STANDARD" | "URGENT" | "MINIMAL"; // default STANDARD
  tone?: "ENTHUSIASTIC" | "INFORMATIVE" | "CONCISE"; // default ENTHUSIASTIC
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

export class DealReplyComposerService {
  readonly version = "v1.0.0-template";

  composeReply(
    products: DealReplyProductItem[],
    options?: DealReplyComposerOptions
  ): ComposedDealReplyResult {
    if (!products || products.length === 0) {
      throw new Error("Cannot compose deal reply without at least one product item");
    }

    const emojiLevel = options?.emojiLevel ?? "STANDARD";
    const ctaType = options?.ctaType ?? "STANDARD";
    const tone = options?.tone ?? "ENTHUSIASTIC";

    const fireEmoji = emojiLevel !== "NONE" ? "🔥 " : "";
    const linkEmoji = emojiLevel !== "NONE" ? "👉 " : "";
    const bellEmoji = emojiLevel !== "NONE" ? "⏰ " : "";
    const cartEmoji = emojiLevel !== "NONE" ? "🛒 " : "";

    const lines: string[] = [];
    const directUrls: string[] = [];
    const primaryItem = products[0];
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

    function formatVnd(amount: number): string {
      return `${amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}đ`;
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
        lines.push(
          `• Giá: ${basePriceFormatted} → áp ${voucherDesc} ước tính còn ~${finalPriceFormatted} (tiết kiệm ${formatVnd(calculation.discountAmount)}).`
        );
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

        if (directDiscountPct && directDiscountPct > 0) {
          const originalFormatted = calculation.evidence?.originalPrice
            ? ` (gốc ${formatVnd(calculation.evidence.originalPrice)})`
            : "";
          lines.push(
            `• Giảm trực tiếp ${directDiscountPct}%: chỉ còn ${basePriceFormatted}${originalFormatted}`
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
