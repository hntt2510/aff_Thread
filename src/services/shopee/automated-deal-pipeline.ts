/**
 * Automated Shopee Deal Pipeline.
 * Automatically extracts base_price, original_price, voucher_info, and calculates
 * server-authoritative final prices and deal opportunity scores without manual input.
 */

import { finalPriceCalculator, FinalPriceCalculationResult } from "./final-price-calculator";
import { dealOpportunityScoringService, DealOpportunityBreakdown } from "./deal-opportunity-scoring.service";
import { parseShopeePrice } from "./shopee-top-offers.service";

export interface AutomatedDealInput {
  price?: string | number | null;
  priceBeforeDiscount?: string | number | null;
  originalPrice?: string | number | null;
  discount?: string | null;
  voucherInfo?: any;
  voucherCode?: string | null;
  commissionRate?: number | string | null;
  evaluationTime?: Date | string | null;
}

export interface AutomatedDealResult {
  basePrice: number;
  originalPrice: number;
  voucherCode: string | null;
  voucherDiscountType: "PERCENT" | "FIXED" | null;
  voucherDiscountPercent: number | null;
  voucherDiscountAmount: number | null;
  voucherMaxDiscount: number | null;
  voucherMinSpend: number | null;
  voucherValidFrom: Date | null;
  voucherValidUntil: Date | null;
  estimatedFinalPrice: number;
  discountAmount: number;
  dealState: string;
  applicable: string;
  dealOpportunityScore: number;
  calculation: FinalPriceCalculationResult;
  dealOpportunity: DealOpportunityBreakdown;
}

/**
 * Formats commission rate cleanly.
 * Handles both 0-1 ratio (0.22 -> "22.0%") and 1-100 percentage ("22%", 22 -> "22.0%").
 */
export function formatCommissionRate(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return "—";
  const str = String(raw).replace("%", "").replace(",", ".").trim();
  const val = parseFloat(str);
  if (isNaN(val)) return "—";
  if (val > 0 && val <= 1.0) {
    return `${(val * 100).toFixed(1)}%`;
  }
  return `${val.toFixed(1)}%`;
}

/**
 * Extracts and cleans voucher facts from heterogeneous Shopee voucher_info structures.
 */
export function extractVoucherFacts(rawVoucher: any): {
  voucherCode: string | null;
  voucherDiscountType: "PERCENT" | "FIXED" | null;
  voucherDiscountPercent: number | null;
  voucherDiscountAmount: number | null;
  voucherMaxDiscount: number | null;
  voucherMinSpend: number | null;
  voucherValidFrom: Date | null;
  voucherValidUntil: Date | null;
} {
  if (!rawVoucher || typeof rawVoucher !== "object") {
    return {
      voucherCode: null,
      voucherDiscountType: null,
      voucherDiscountPercent: null,
      voucherDiscountAmount: null,
      voucherMaxDiscount: null,
      voucherMinSpend: null,
      voucherValidFrom: null,
      voucherValidUntil: null,
    };
  }

  // 1. Voucher Code
  const rawCode =
    rawVoucher.voucher_code ??
    rawVoucher.code ??
    rawVoucher.voucherCode ??
    rawVoucher.promotion_id ??
    null;
  const voucherCode = typeof rawCode === "string" && rawCode.trim() ? rawCode.trim() : null;

  // 2. Discount Percent
  let voucherDiscountPercent: number | null = null;
  if (rawVoucher.discount_percentage !== undefined && rawVoucher.discount_percentage !== null) {
    const p = Number(rawVoucher.discount_percentage);
    if (!isNaN(p) && p > 0) voucherDiscountPercent = p;
  } else if (rawVoucher.discount_rate !== undefined && rawVoucher.discount_rate !== null) {
    const p = Number(rawVoucher.discount_rate);
    if (!isNaN(p) && p > 0) voucherDiscountPercent = p > 1.0 ? p : p * 100;
  } else if (rawVoucher.discount && typeof rawVoucher.discount === "string" && rawVoucher.discount.includes("%")) {
    const p = parseFloat(rawVoucher.discount.replace("%", "").replace(",", "."));
    if (!isNaN(p) && p > 0) voucherDiscountPercent = p;
  } else if (rawVoucher.label && typeof rawVoucher.label === "string") {
    const match = rawVoucher.label.match(/(\d+(?:[.,]\d+)?)\s*%/);
    if (match) {
      const p = parseFloat(match[1].replace(",", "."));
      if (!isNaN(p) && p > 0) voucherDiscountPercent = p;
    }
  }

  // 3. Discount Amount (Fixed VND)
  let voucherDiscountAmount: number | null = null;
  if (rawVoucher.discount_value !== undefined && rawVoucher.discount_value !== null) {
    const amt = parseShopeePrice(rawVoucher.discount_value);
    if (amt > 0) voucherDiscountAmount = amt;
  } else if (rawVoucher.discount_amount !== undefined && rawVoucher.discount_amount !== null) {
    const amt = parseShopeePrice(rawVoucher.discount_amount);
    if (amt > 0) voucherDiscountAmount = amt;
  } else if (rawVoucher.discountAmount !== undefined && rawVoucher.discountAmount !== null) {
    const amt = parseShopeePrice(rawVoucher.discountAmount);
    if (amt > 0) voucherDiscountAmount = amt;
  } else if (rawVoucher.label && typeof rawVoucher.label === "string" && !voucherDiscountPercent) {
    const match = rawVoucher.label.match(/giảm\s*(\d+(?:[.,]\d+)?)\s*([kKtrTRmđ₫vndVND]*)/i);
    if (match) {
      const amt = parseShopeePrice(`${match[1]}${match[2]}`);
      if (amt > 0) voucherDiscountAmount = amt;
    }
  }

  // 4. Type
  let voucherDiscountType: "PERCENT" | "FIXED" | null = null;
  if (voucherDiscountPercent !== null && voucherDiscountPercent > 0) {
    voucherDiscountType = "PERCENT";
  } else if (voucherDiscountAmount !== null && voucherDiscountAmount > 0) {
    voucherDiscountType = "FIXED";
  }

  // 5. Min Spend & Max Discount
  let voucherMinSpend: number | null = null;
  if (rawVoucher.min_spend !== undefined && rawVoucher.min_spend !== null) {
    const ms = parseShopeePrice(rawVoucher.min_spend);
    if (ms > 0) voucherMinSpend = ms;
  } else if (rawVoucher.minSpend !== undefined && rawVoucher.minSpend !== null) {
    const ms = parseShopeePrice(rawVoucher.minSpend);
    if (ms > 0) voucherMinSpend = ms;
  }

  let voucherMaxDiscount: number | null = null;
  if (rawVoucher.max_discount !== undefined && rawVoucher.max_discount !== null) {
    const md = parseShopeePrice(rawVoucher.max_discount);
    if (md > 0) voucherMaxDiscount = md;
  } else if (rawVoucher.maxDiscount !== undefined && rawVoucher.maxDiscount !== null) {
    const md = parseShopeePrice(rawVoucher.maxDiscount);
    if (md > 0) voucherMaxDiscount = md;
  }

  // 6. Valid From / Until Dates
  let voucherValidFrom: Date | null = null;
  const rawStart = rawVoucher.start_time ?? rawVoucher.startTime ?? rawVoucher.valid_from ?? rawVoucher.validFrom;
  if (rawStart) {
    const d = typeof rawStart === "number" && rawStart < 10000000000 ? new Date(rawStart * 1000) : new Date(rawStart);
    if (!isNaN(d.getTime())) voucherValidFrom = d;
  }

  let voucherValidUntil: Date | null = null;
  const rawEnd = rawVoucher.end_time ?? rawVoucher.endTime ?? rawVoucher.valid_until ?? rawVoucher.validUntil;
  if (rawEnd) {
    const d = typeof rawEnd === "number" && rawEnd < 10000000000 ? new Date(rawEnd * 1000) : new Date(rawEnd);
    if (!isNaN(d.getTime())) voucherValidUntil = d;
  }

  return {
    voucherCode,
    voucherDiscountType,
    voucherDiscountPercent,
    voucherDiscountAmount,
    voucherMaxDiscount,
    voucherMinSpend,
    voucherValidFrom,
    voucherValidUntil,
  };
}

/**
 * Automates the deal facts extraction and final price calculation from raw Shopee inputs.
 */
export function extractAndCalculateShopeeDeal(input: AutomatedDealInput): AutomatedDealResult {
  const evalTime = input.evaluationTime ? new Date(input.evaluationTime) : new Date();

  // 1. Base Price extraction (handles 5 zero-decimals e.g. "12600000000" -> 126000, "74.0k" -> 74000)
  const basePrice = input.price !== undefined && input.price !== null ? parseShopeePrice(input.price) : 0;

  // 2. Original Price extraction
  const rawOrig = input.priceBeforeDiscount ?? input.originalPrice ?? null;
  let originalPrice = rawOrig !== null ? parseShopeePrice(rawOrig) : basePrice;
  if (originalPrice <= 0 || originalPrice < basePrice) {
    originalPrice = basePrice;
  }

  // 3. Voucher Facts extraction
  const voucherFacts = extractVoucherFacts(input.voucherInfo);
  const voucherCode = input.voucherCode || voucherFacts.voucherCode;

  // 4. Authoritative Final Price Calculation
  const calculation = finalPriceCalculator.calculate({
    observedPrice: basePrice,
    originalPrice: originalPrice > basePrice ? originalPrice : null,
    voucherCode,
    voucherDiscountType: voucherFacts.voucherDiscountType,
    voucherDiscountPercent: voucherFacts.voucherDiscountPercent,
    voucherDiscountAmount: voucherFacts.voucherDiscountAmount,
    voucherMaxDiscount: voucherFacts.voucherMaxDiscount,
    voucherMinSpend: voucherFacts.voucherMinSpend,
    voucherValidFrom: voucherFacts.voucherValidFrom,
    voucherValidUntil: voucherFacts.voucherValidUntil,
    userEligibility: "ELIGIBLE",
    evaluationTime: evalTime,
  });

  // 5. Deal Opportunity Scoring
  let commissionRateNum: number | null = null;
  if (input.commissionRate !== undefined && input.commissionRate !== null) {
    const str = String(input.commissionRate).replace("%", "").replace(",", ".").trim();
    const parsed = parseFloat(str);
    if (!isNaN(parsed) && parsed > 0) {
      commissionRateNum = parsed > 1.0 ? parsed / 100 : parsed;
    }
  }

  const dealOpportunity = dealOpportunityScoringService.evaluate({
    calculation,
    originalPrice: originalPrice > basePrice ? originalPrice : null,
    voucherMinSpend: voucherFacts.voucherMinSpend,
    voucherMaxDiscount: voucherFacts.voucherMaxDiscount,
    commissionRate: commissionRateNum,
  });

  return {
    basePrice,
    originalPrice,
    voucherCode,
    voucherDiscountType: voucherFacts.voucherDiscountType,
    voucherDiscountPercent: voucherFacts.voucherDiscountPercent,
    voucherDiscountAmount: voucherFacts.voucherDiscountAmount,
    voucherMaxDiscount: voucherFacts.voucherMaxDiscount,
    voucherMinSpend: voucherFacts.voucherMinSpend,
    voucherValidFrom: voucherFacts.voucherValidFrom,
    voucherValidUntil: voucherFacts.voucherValidUntil,
    estimatedFinalPrice: calculation.estimatedFinalPrice,
    discountAmount: calculation.discountAmount,
    dealState: calculation.dealState,
    applicable: calculation.applicable,
    dealOpportunityScore: dealOpportunity.score,
    calculation,
    dealOpportunity,
  };
}
