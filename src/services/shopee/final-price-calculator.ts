/**
 * Pure deterministic Final Price Calculator for Shopee Deals & Vouchers.
 * Floating point rounding errors are eliminated by enforcing integer VND calculations.
 * Never fabricates prices or claims future vouchers are active currently.
 */

export type DealState = "UPCOMING" | "ACTIVE" | "EXPIRED" | "UNKNOWN" | "INVALID";
export type VoucherApplicability = "YES" | "NO" | "UNKNOWN";

export interface PriceCalculationInput {
  observedPrice: number; // Base observed product price in VND
  originalPrice?: number | null; // Retail/list price before direct discount
  quantity?: number; // Default 1
  voucherCode?: string | null;
  voucherType?: string | null;
  voucherDiscountType?: "PERCENT" | "FIXED" | null;
  voucherDiscountPercent?: number | null; // e.g. 30 for 30%
  voucherDiscountAmount?: number | null; // fixed amount in VND
  voucherMaxDiscount?: number | null; // maximum cap in VND
  voucherMinSpend?: number | null; // minimum required spend in VND
  voucherValidFrom?: Date | string | null;
  voucherValidUntil?: Date | string | null;
  userEligibility?: "ELIGIBLE" | "INELIGIBLE" | "UNKNOWN";
  evaluationTime?: Date | string | null;
}

export interface FinalPriceCalculationResult {
  dealState: DealState;
  applicable: VoucherApplicability;
  basePrice: number;
  discountAmount: number;
  estimatedFinalPrice: number;
  reason: string;
  warning?: string;
  calculationVersion: string;
  confidence: number;
  validAt: Date;
  evidence: {
    basePrice: number;
    originalPrice?: number | null;
    voucherCode?: string | null;
    voucherDiscountType?: string | null;
    voucherDiscountPercent?: number | null;
    voucherDiscountAmount?: number | null;
    voucherMaxDiscount?: number | null;
    voucherMinSpend?: number | null;
    voucherValidFrom?: Date | null;
    voucherValidUntil?: Date | null;
    evaluationTime: Date;
  };
}

export class FinalPriceCalculator {
  readonly version = "v1.0.0-deterministic";

  calculate(input: PriceCalculationInput): FinalPriceCalculationResult {
    const evalTime = input.evaluationTime ? new Date(input.evaluationTime) : new Date();
    const qty = Math.max(1, Math.floor(input.quantity ?? 1));
    const basePrice = Math.round(Number(input.observedPrice) || 0);
    const originalPrice = input.originalPrice ? Math.round(Number(input.originalPrice)) : null;

    const validFrom = input.voucherValidFrom ? new Date(input.voucherValidFrom) : null;
    const validUntil = input.voucherValidUntil ? new Date(input.voucherValidUntil) : null;
    const userEligibility = input.userEligibility ?? "ELIGIBLE";

    const evidence = {
      basePrice,
      originalPrice,
      voucherCode: input.voucherCode ?? null,
      voucherDiscountType: input.voucherDiscountType ?? null,
      voucherDiscountPercent: input.voucherDiscountPercent ?? null,
      voucherDiscountAmount: input.voucherDiscountAmount ?? null,
      voucherMaxDiscount: input.voucherMaxDiscount ?? null,
      voucherMinSpend: input.voucherMinSpend ?? null,
      voucherValidFrom: validFrom,
      voucherValidUntil: validUntil,
      evaluationTime: evalTime,
    };

    // 1. Validate Base Price
    if (basePrice <= 0 || isNaN(basePrice)) {
      return {
        dealState: "INVALID",
        applicable: "NO",
        basePrice: 0,
        discountAmount: 0,
        estimatedFinalPrice: 0,
        reason: "Invalid or zero observed price",
        calculationVersion: this.version,
        confidence: 0,
        validAt: evalTime,
        evidence,
      };
    }

    const totalSpend = basePrice * qty;

    // 2. Check if voucher parameters are provided
    const hasVoucher = Boolean(
      (input.voucherDiscountType === "PERCENT" && input.voucherDiscountPercent && input.voucherDiscountPercent > 0) ||
      (input.voucherDiscountType === "FIXED" && input.voucherDiscountAmount && input.voucherDiscountAmount > 0) ||
      (input.voucherDiscountPercent && input.voucherDiscountPercent > 0) ||
      (input.voucherDiscountAmount && input.voucherDiscountAmount > 0)
    );

    if (!hasVoucher) {
      return {
        dealState: "ACTIVE",
        applicable: "NO",
        basePrice,
        discountAmount: 0,
        estimatedFinalPrice: basePrice,
        reason: "No voucher applied. Regular observed price.",
        calculationVersion: this.version,
        confidence: 1.0,
        validAt: evalTime,
        evidence,
      };
    }

    // 3. Temporal State Evaluation
    const isUpcoming = validFrom !== null && evalTime.getTime() < validFrom.getTime();
    const isExpired = validUntil !== null && evalTime.getTime() > validUntil.getTime();

    if (isExpired) {
      return {
        dealState: "EXPIRED",
        applicable: "NO",
        basePrice,
        discountAmount: 0,
        estimatedFinalPrice: basePrice,
        reason: `Voucher expired at ${validUntil!.toISOString()}`,
        calculationVersion: this.version,
        confidence: 1.0,
        validAt: evalTime,
        evidence,
      };
    }

    // 4. Minimum spend check
    if (input.voucherMinSpend && input.voucherMinSpend > 0) {
      if (totalSpend < input.voucherMinSpend) {
        return {
          dealState: isUpcoming ? "UPCOMING" : "ACTIVE",
          applicable: "NO",
          basePrice,
          discountAmount: 0,
          estimatedFinalPrice: basePrice,
          reason: `Minimum spend of ${input.voucherMinSpend.toLocaleString()}đ not met (order value: ${totalSpend.toLocaleString()}đ for qty ${qty})`,
          warning: isUpcoming
            ? `Voucher starts in future but minimum spend is not met.`
            : undefined,
          calculationVersion: this.version,
          confidence: 1.0,
          validAt: evalTime,
          evidence,
        };
      }
    }

    // 5. Ineligible user check
    if (userEligibility === "INELIGIBLE") {
      return {
        dealState: isUpcoming ? "UPCOMING" : "ACTIVE",
        applicable: "NO",
        basePrice,
        discountAmount: 0,
        estimatedFinalPrice: basePrice,
        reason: "User account is not eligible for this voucher.",
        calculationVersion: this.version,
        confidence: 1.0,
        validAt: evalTime,
        evidence,
      };
    }

    // 6. Calculate voucher discount amount
    let rawDiscount = 0;
    const discountType = input.voucherDiscountType || (input.voucherDiscountPercent ? "PERCENT" : "FIXED");

    if (discountType === "PERCENT") {
      const pct = Math.min(100, Math.max(0, input.voucherDiscountPercent ?? 0));
      rawDiscount = Math.round((basePrice * pct) / 100);
    } else {
      rawDiscount = Math.round(Number(input.voucherDiscountAmount) || 0);
    }

    // Apply voucher max discount cap if defined
    let discountAmount = rawDiscount;
    if (input.voucherMaxDiscount && input.voucherMaxDiscount > 0) {
      discountAmount = Math.min(discountAmount, Math.round(input.voucherMaxDiscount));
    }

    // Clamping to avoid negative price or negative discount
    discountAmount = Math.min(basePrice, Math.max(0, discountAmount));
    const estimatedFinalPrice = basePrice - discountAmount;

    // 7. Handle UPCOMING voucher state vs ACTIVE state
    if (isUpcoming) {
      const msUntilStart = validFrom!.getTime() - evalTime.getTime();
      const minutesUntilStart = Math.ceil(msUntilStart / (1000 * 60));
      const hoursUntilStart = Math.floor(minutesUntilStart / 60);
      const remainingMinutes = minutesUntilStart % 60;

      const timeText =
        hoursUntilStart > 0
          ? `${hoursUntilStart}h ${remainingMinutes}m`
          : `${remainingMinutes} minutes`;

      return {
        dealState: "UPCOMING",
        applicable: userEligibility === "UNKNOWN" ? "UNKNOWN" : "YES",
        basePrice,
        discountAmount,
        estimatedFinalPrice,
        reason: `Voucher starts in ${timeText} (at ${validFrom!.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}). Estimated price upon activation.`,
        warning: `Voucher not active yet. Starts in ${timeText}. Do not claim ${estimatedFinalPrice.toLocaleString()}đ as current price.`,
        calculationVersion: this.version,
        confidence: userEligibility === "UNKNOWN" ? 0.7 : 0.9,
        validAt: evalTime,
        evidence,
      };
    }

    // ACTIVE Deal
    const applicability: VoucherApplicability = userEligibility === "UNKNOWN" ? "UNKNOWN" : "YES";
    const warning =
      userEligibility === "UNKNOWN"
        ? "Voucher observed, but applicability may depend on user account, payment method, or voucher quota."
        : undefined;

    return {
      dealState: "ACTIVE",
      applicable: applicability,
      basePrice,
      discountAmount,
      estimatedFinalPrice,
      reason: `Active voucher applied. Saved ${discountAmount.toLocaleString()}đ (${basePrice.toLocaleString()}đ → ${estimatedFinalPrice.toLocaleString()}đ).`,
      warning,
      calculationVersion: this.version,
      confidence: userEligibility === "UNKNOWN" ? 0.8 : 1.0,
      validAt: evalTime,
      evidence,
    };
  }
}

export const finalPriceCalculator = new FinalPriceCalculator();
