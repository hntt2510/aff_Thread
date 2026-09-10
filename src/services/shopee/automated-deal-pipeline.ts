/**
 * Automated Shopee Deal Pipeline.
 * Automatically extracts base_price, original_price, voucher_info, and calculates
 * server-authoritative final prices and deal opportunity scores without manual input.
 */

import { finalPriceCalculator, FinalPriceCalculationResult } from "./final-price-calculator";
import { dealOpportunityScoringService, DealOpportunityBreakdown } from "./deal-opportunity-scoring.service";
import { parseShopeePrice } from "./shopee-top-offers.service";
import {
  shopeeVoucherStackerService,
  PlatformVoucherConfig,
  VoucherStackerResult,
} from "./shopee-voucher-stacker.service";

export interface AutomatedDealInput {
  price?: string | number | null;
  priceBeforeDiscount?: string | number | null;
  originalPrice?: string | number | null;
  discount?: string | null;
  voucherInfo?: any;
  voucherCode?: string | null;
  commissionRate?: number | string | null;
  platformVoucherConfig?: PlatformVoucherConfig | null;
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
  stackedPricing?: VoucherStackerResult;
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
  const v =
    rawVoucher?.batch_item_for_item_card_full?.voucher_info ||
    rawVoucher?.voucher_info ||
    rawVoucher?.voucherInfo ||
    rawVoucher;

  if (!v || typeof v !== "object") {
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
    v.voucher_code ??
    v.code ??
    v.voucherCode ??
    v.promotion_id ??
    null;
  const voucherCode = typeof rawCode === "string" && rawCode.trim() ? rawCode.trim() : null;

  // 2. Discount Percent
  let voucherDiscountPercent: number | null = null;
  if (v.discount_percentage !== undefined && v.discount_percentage !== null) {
    const p = Number(v.discount_percentage);
    if (!isNaN(p) && p > 0) voucherDiscountPercent = p;
  } else if (v.discount_rate !== undefined && v.discount_rate !== null) {
    const p = Number(v.discount_rate);
    if (!isNaN(p) && p > 0) voucherDiscountPercent = p > 1.0 ? p : p * 100;
  } else if (v.discount && typeof v.discount === "string" && v.discount.includes("%")) {
    const p = parseFloat(v.discount.replace("%", "").replace(",", "."));
    if (!isNaN(p) && p > 0) voucherDiscountPercent = p;
  } else if (v.label && typeof v.label === "string") {
    const match = v.label.match(/(\d+(?:[.,]\d+)?)\s*%/);
    if (match) {
      const p = parseFloat(match[1].replace(",", "."));
      if (!isNaN(p) && p > 0) voucherDiscountPercent = p;
    }
  }

  // 3. Discount Amount (Fixed VND)
  let voucherDiscountAmount: number | null = null;
  if (v.discount_value !== undefined && v.discount_value !== null) {
    const amt = parseShopeePrice(v.discount_value);
    if (amt > 0) voucherDiscountAmount = amt;
  } else if (v.discount_amount !== undefined && v.discount_amount !== null) {
    const amt = parseShopeePrice(v.discount_amount);
    if (amt > 0) voucherDiscountAmount = amt;
  } else if (v.discountAmount !== undefined && v.discountAmount !== null) {
    const amt = parseShopeePrice(v.discountAmount);
    if (amt > 0) voucherDiscountAmount = amt;
  } else if (v.label && typeof v.label === "string" && !voucherDiscountPercent) {
    const match = v.label.match(/giảm\s*(\d+(?:[.,]\d+)?)\s*([kKtrTRmđ₫vndVND]*)/i);
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
  if (v.min_spend !== undefined && v.min_spend !== null) {
    const ms = parseShopeePrice(v.min_spend);
    if (ms > 0) voucherMinSpend = ms;
  } else if (v.minSpend !== undefined && v.minSpend !== null) {
    const ms = parseShopeePrice(v.minSpend);
    if (ms > 0) voucherMinSpend = ms;
  }

  let voucherMaxDiscount: number | null = null;
  if (v.max_discount !== undefined && v.max_discount !== null) {
    const md = parseShopeePrice(v.max_discount);
    if (md > 0) voucherMaxDiscount = md;
  } else if (v.maxDiscount !== undefined && v.maxDiscount !== null) {
    const md = parseShopeePrice(v.maxDiscount);
    if (md > 0) voucherMaxDiscount = md;
  }

  // 6. Valid From / Until Dates
  let voucherValidFrom: Date | null = null;
  const rawStart = v.start_time ?? v.startTime ?? v.valid_from ?? v.validFrom;
  if (rawStart) {
    const d = typeof rawStart === "number" && rawStart < 10000000000 ? new Date(rawStart * 1000) : new Date(rawStart);
    if (!isNaN(d.getTime())) voucherValidFrom = d;
  }

  let voucherValidUntil: Date | null = null;
  const rawEnd = v.end_time ?? v.endTime ?? v.valid_until ?? v.validUntil;
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

  // 6. Multi-tier Stacking (Shop Voucher + Platform Voucher)
  const stackedPricing = shopeeVoucherStackerService.stackVouchers({
    basePrice,
    originalPrice,
    shopVoucher: {
      code: voucherCode,
      discountType: voucherFacts.voucherDiscountType,
      discountPercent: voucherFacts.voucherDiscountPercent,
      discountAmount: voucherFacts.voucherDiscountAmount,
      maxDiscount: voucherFacts.voucherMaxDiscount,
      minSpend: voucherFacts.voucherMinSpend,
      validFrom: voucherFacts.voucherValidFrom,
      validUntil: voucherFacts.voucherValidUntil,
    },
    platformVoucherConfig: input.platformVoucherConfig,
    evaluationTime: evalTime,
  });

  const estimatedFinalPrice =
    calculation.estimatedFinalPrice > 0
      ? calculation.estimatedFinalPrice
      : basePrice;

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
    estimatedFinalPrice,
    discountAmount: calculation.discountAmount,
    dealState: calculation.dealState,
    applicable: calculation.applicable,
    dealOpportunityScore: dealOpportunity.score,
    calculation,
    dealOpportunity,
    stackedPricing,
  };
}
