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
      const { title, directAffiliateUrl, calculation } = item;
      directUrls.push(directAffiliateUrl);

      const basePriceFormatted = formatVnd(calculation.basePrice);
      const finalPriceFormatted = formatVnd(calculation.estimatedFinalPrice);

      let voucherDesc = "";
      if (item.voucherDiscountPercent) {
        voucherDesc = `voucher ${item.voucherDiscountPercent}%`;
      } else if (item.voucherDiscountAmount) {
        voucherDesc = `voucher giảm ${formatVnd(item.voucherDiscountAmount)}`;
      } else if (item.voucherCode) {
        voucherDesc = `mã ${item.voucherCode}`;
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
        lines.push(`• Giá tham khảo: ${basePriceFormatted}`);
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
