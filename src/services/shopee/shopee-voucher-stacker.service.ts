/**
 * Shopee Multi-tier Voucher Stacker Service.
 * Stacks Shop Voucher and Shopee Platform Voucher (Voucher Toàn Sàn)
 * using the deterministic formula:
 *   finalPrice = Math.max(0, basePrice - shopDiscountAmount - platformDiscountAmount)
 */

export interface PlatformVoucherConfig {
  enabled?: boolean;
  discountPercent?: number; // e.g. 10 for 10%
  maxDiscountAmount?: number; // e.g. 25000 for 25,000 VND
  minSpend?: number; // e.g. 0 or 50000 VND
}

export interface ShopVoucherFacts {
  code?: string | null;
  discountType?: "PERCENT" | "FIXED" | null;
  discountPercent?: number | null;
  discountAmount?: number | null;
  maxDiscount?: number | null;
  minSpend?: number | null;
  validFrom?: Date | string | null;
  validUntil?: Date | string | null;
}

export interface VoucherStackerInput {
  basePrice: number;
  originalPrice?: number | null;
  shopVoucher?: ShopVoucherFacts | null;
  platformVoucherConfig?: PlatformVoucherConfig | null;
  evaluationTime?: Date | string | null;
}

export interface VoucherStackerResult {
  basePrice: number;
  originalPrice: number;
  shopDiscountAmount: number;
  platformDiscountAmount: number;
  totalDiscountAmount: number;
  finalPrice: number;
  shopVoucherCode: string | null;
  shopVoucherPercent: number | null;
  platformDiscountPercent: number;
  platformMaxDiscount: number;
  hasShopVoucher: boolean;
  hasPlatformVoucher: boolean;
  explanation: string;
}

export const DEFAULT_PLATFORM_VOUCHER_CONFIG: Required<PlatformVoucherConfig> = {
  enabled: true,
  discountPercent: 10, // 10%
  maxDiscountAmount: 25000, // max 25,000 VND discount
  minSpend: 0,
};

export class ShopeeVoucherStackerService {
  readonly version = "v1.0.0-voucher-stacker";

  stackVouchers(input: VoucherStackerInput): VoucherStackerResult {
    const basePrice = Math.max(0, Math.round(input.basePrice || 0));
    const rawOrig = input.originalPrice ? Math.max(0, Math.round(input.originalPrice)) : 0;
    const originalPrice = rawOrig > basePrice ? rawOrig : basePrice;

    const platConfig: Required<PlatformVoucherConfig> = {
      ...DEFAULT_PLATFORM_VOUCHER_CONFIG,
      ...(input.platformVoucherConfig || {}),
    };

    // 1. Calculate Shop Voucher Discount
    let shopDiscountAmount = 0;
    let hasShopVoucher = false;
    let shopVoucherCode: string | null = null;
    let shopVoucherPercent: number | null = null;

    const shop = input.shopVoucher;
    if (shop) {
      if (shop.code && typeof shop.code === "string" && shop.code.trim()) {
        shopVoucherCode = shop.code.trim();
      }

      const meetsMinSpend = !shop.minSpend || basePrice >= shop.minSpend;

      // Temporal check if validFrom or validUntil are provided
      let isTemporallyValid = true;
      if (input.evaluationTime) {
        const evalTime = new Date(input.evaluationTime).getTime();
        if (shop.validFrom && evalTime < new Date(shop.validFrom).getTime()) {
          isTemporallyValid = false;
        }
        if (shop.validUntil && evalTime > new Date(shop.validUntil).getTime()) {
          isTemporallyValid = false;
        }
      }

      if (meetsMinSpend && isTemporallyValid) {
        if (shop.discountPercent && shop.discountPercent > 0) {
          shopVoucherPercent = shop.discountPercent;
          const rawDiscount = Math.round(basePrice * (shop.discountPercent / 100));
          const maxCap = shop.maxDiscount && shop.maxDiscount > 0 ? shop.maxDiscount : Infinity;
          shopDiscountAmount = Math.min(rawDiscount, maxCap);
          if (shopDiscountAmount > 0) hasShopVoucher = true;
        } else if (shop.discountAmount && shop.discountAmount > 0) {
          shopDiscountAmount = Math.min(shop.discountAmount, basePrice);
          if (shopDiscountAmount > 0) hasShopVoucher = true;
        } else if (shopVoucherCode) {
          // Voucher code exists without explicit discount, mark as active voucher with 0 calc
          hasShopVoucher = true;
        }
      }
    }

    // 2. Calculate Platform Voucher Discount (Voucher Toàn Sàn)
    let platformDiscountAmount = 0;
    let hasPlatformVoucher = false;

    if (platConfig.enabled && basePrice >= platConfig.minSpend) {
      const remainingPrice = Math.max(0, basePrice - shopDiscountAmount);
      if (remainingPrice > 0 && platConfig.discountPercent > 0) {
        const calculatedPlatDiscount = Math.round(basePrice * (platConfig.discountPercent / 100));
        platformDiscountAmount = Math.min(calculatedPlatDiscount, platConfig.maxDiscountAmount, remainingPrice);
        if (platformDiscountAmount > 0) {
          hasPlatformVoucher = true;
        }
      }
    }

    // 3. Multi-tier Stacked Final Price
    const totalDiscountAmount = shopDiscountAmount + platformDiscountAmount;
    const finalPrice = Math.max(0, basePrice - totalDiscountAmount);

    const parts: string[] = [];
    if (hasShopVoucher) {
      parts.push(`Shop Voucher: -${shopDiscountAmount.toLocaleString("vi-VN")}đ`);
    }
    if (hasPlatformVoucher) {
      parts.push(`Platform Voucher (${platConfig.discountPercent}%): -${platformDiscountAmount.toLocaleString("vi-VN")}đ`);
    }
    const explanation = parts.length > 0
      ? parts.join(" + ") + ` => Giá sau ưu đãi: ${finalPrice.toLocaleString("vi-VN")}đ`
      : `Giá niêm yết: ${basePrice.toLocaleString("vi-VN")}đ`;

    return {
      basePrice,
      originalPrice,
      shopDiscountAmount,
      platformDiscountAmount,
      totalDiscountAmount,
      finalPrice,
      shopVoucherCode,
      shopVoucherPercent,
      platformDiscountPercent: platConfig.discountPercent,
      platformMaxDiscount: platConfig.maxDiscountAmount,
      hasShopVoucher,
      hasPlatformVoucher,
      explanation,
    };
  }
}

export const shopeeVoucherStackerService = new ShopeeVoucherStackerService();
