import { db } from "@/db";
import {
  productDealObservations,
  affiliateProducts,
  affiliateProductOffers,
  ProductDealObservation,
} from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import {
  finalPriceCalculator,
  PriceCalculationInput,
  FinalPriceCalculationResult,
  DealState,
  VoucherApplicability,
} from "./final-price-calculator";
import { dealOpportunityScoringService, DealOpportunityBreakdown } from "./deal-opportunity-scoring.service";

/**
 * ONE DEAL FACT PIPELINE
 *
 * Observation / Raw Facts
 *        ↓
 * FinalPriceCalculator (Integer VND, Voucher Caps, Min Spend, Temporal State)
 *        ↓
 * DealOpportunityScoringService (0–100 Independent Deal Attractiveness)
 *        ↓
 * Calculation Snapshot (AuthoritativeDealCalculationResult)
 *        ├── UI Preview (Debounced server fetch)
 *        ├── Product Matcher (Ranks deals using opportunity score)
 *        ├── Reply Composer (Formats verified VND prices verbatim)
 *        └── Future Deal Image (Card generator)
 *
 * INVARIANT: No consumer recalculates financial or deal facts independently.
 */

export interface CalculateDealInput {
  observedPrice: number;
  originalPrice?: number | null;
  voucherDiscountType?: "PERCENT" | "FIXED" | null;
  voucherDiscountPercent?: number | null;
  voucherDiscountAmount?: number | null;
  voucherMaxDiscount?: number | null;
  voucherMinSpend?: number | null;
  voucherValidFrom?: Date | string | null;
  voucherValidUntil?: Date | string | null;
  voucherCode?: string | null;
  voucherType?: string | null;
  userEligibility?: "ELIGIBLE" | "INELIGIBLE" | "UNKNOWN";
  flashSale?: boolean;
  freeShipping?: boolean;
  commissionRate?: number | null;
  evaluationTime?: Date | string | null;
}

export interface AuthoritativeDealCalculationResult {
  state: DealState;
  dealState: DealState;
  applicable: VoucherApplicability;
  basePrice: number;
  discountAmount: number;
  estimatedFinalPrice: number;
  calculationVersion: string;
  reason: string;
  confidence: number;
  validAt: string;
  dealScore: number;
  dealScoreVersion: string;
  dealScoreExplanation: string;
  warnings: string[];
  warning?: string;
  evidence: FinalPriceCalculationResult["evidence"];
  dealOpportunity: DealOpportunityBreakdown;
  calculation: FinalPriceCalculationResult;
}

export interface RecordDealObservationInput extends CalculateDealInput {
  productId: string;
  offerId?: string | null;
  currency?: string;
  availabilityStatus?: string;
  source?: string;
}

export class ShopeeDealService {
  /**
   * Authoritative deal preview calculation.
   * Single server-side source of truth for UI preview, matcher, and composer.
   */
  calculateDeal(input: CalculateDealInput): AuthoritativeDealCalculationResult {
    const evalTime = input.evaluationTime ? new Date(input.evaluationTime) : new Date();

    const calcInput: PriceCalculationInput = {
      observedPrice: Math.round(Number(input.observedPrice) || 0),
      originalPrice: input.originalPrice ? Math.round(Number(input.originalPrice)) : null,
      voucherCode: input.voucherCode ?? null,
      voucherType: input.voucherType ?? null,
      voucherDiscountType: input.voucherDiscountType ?? null,
      voucherDiscountPercent:
        input.voucherDiscountPercent !== undefined && input.voucherDiscountPercent !== null
          ? Number(input.voucherDiscountPercent)
          : null,
      voucherDiscountAmount:
        input.voucherDiscountAmount !== undefined && input.voucherDiscountAmount !== null
          ? Math.round(Number(input.voucherDiscountAmount))
          : null,
      voucherMaxDiscount:
        input.voucherMaxDiscount !== undefined && input.voucherMaxDiscount !== null
          ? Math.round(Number(input.voucherMaxDiscount))
          : null,
      voucherMinSpend:
        input.voucherMinSpend !== undefined && input.voucherMinSpend !== null
          ? Math.round(Number(input.voucherMinSpend))
          : null,
      voucherValidFrom: input.voucherValidFrom ? new Date(input.voucherValidFrom) : null,
      voucherValidUntil: input.voucherValidUntil ? new Date(input.voucherValidUntil) : null,
      userEligibility: input.userEligibility ?? "ELIGIBLE",
      evaluationTime: evalTime,
    };

    const calculation = finalPriceCalculator.calculate(calcInput);

    const dealOpportunity = dealOpportunityScoringService.evaluate({
      calculation,
      originalPrice: input.originalPrice,
      flashSale: input.flashSale,
      freeShipping: input.freeShipping,
      voucherMinSpend: input.voucherMinSpend,
      voucherMaxDiscount: input.voucherMaxDiscount,
      commissionRate: input.commissionRate,
    });

    const warnings: string[] = calculation.warning ? [calculation.warning] : [];

    return {
      state: calculation.dealState,
      dealState: calculation.dealState,
      applicable: calculation.applicable,
      basePrice: calculation.basePrice,
      discountAmount: calculation.discountAmount,
      estimatedFinalPrice: calculation.estimatedFinalPrice,
      calculationVersion: calculation.calculationVersion,
      reason: calculation.reason,
      confidence: calculation.confidence,
      validAt: calculation.validAt.toISOString(),
      dealScore: dealOpportunity.score,
      dealScoreVersion: dealOpportunity.version,
      dealScoreExplanation: dealOpportunity.explanation,
      warnings,
      warning: calculation.warning,
      evidence: calculation.evidence,
      dealOpportunity,
      calculation,
    };
  }

  /**
   * Records a new time-sensitive deal observation, automatically calculates the deterministic
   * final price and assesses the deal opportunity score.
   */
  async recordObservation(input: RecordDealObservationInput): Promise<{
    observation: ProductDealObservation;
    calculation: FinalPriceCalculationResult;
    dealOpportunity: DealOpportunityBreakdown;
  }> {
    const now = new Date();

    // 1. Run authoritative calculation pipeline (ignores any client-calculated prices)
    const dealFacts = this.calculateDeal({
      ...input,
      evaluationTime: now,
    });
    const { calculation, dealOpportunity } = dealFacts;

    // 3. Persist to product_deal_observations
    const [observation] = await db
      .insert(productDealObservations)
      .values({
        productId: input.productId,
        offerId: input.offerId || null,
        observedAt: now,
        observedPrice: input.observedPrice,
        originalPrice: input.originalPrice || null,
        currency: input.currency || "VND",
        directDiscountPercent: input.originalPrice && input.originalPrice > input.observedPrice
          ? String(Math.round(((input.originalPrice - input.observedPrice) / input.originalPrice) * 100))
          : null,
        directDiscountAmount: input.originalPrice && input.originalPrice > input.observedPrice
          ? input.originalPrice - input.observedPrice
          : null,
        voucherCode: input.voucherCode || null,
        voucherType: input.voucherType || null,
        voucherDiscountType: input.voucherDiscountType || null,
        voucherDiscountPercent: input.voucherDiscountPercent ? String(input.voucherDiscountPercent) : null,
        voucherDiscountAmount: input.voucherDiscountAmount || null,
        voucherMaxDiscount: input.voucherMaxDiscount || null,
        voucherMinSpend: input.voucherMinSpend || null,
        voucherValidFrom: input.voucherValidFrom ? new Date(input.voucherValidFrom) : null,
        voucherValidUntil: input.voucherValidUntil ? new Date(input.voucherValidUntil) : null,
        flashSale: input.flashSale || false,
        freeShipping: input.freeShipping || false,
        availabilityStatus: input.availabilityStatus || "IN_STOCK",
        source: input.source || "MANUAL",
        confidence: String(calculation.confidence),
        rawMetadataJson: JSON.stringify({
          calculation,
          dealOpportunity,
        }),
      })
      .returning();

    return {
      observation,
      calculation,
      dealOpportunity,
    };
  }

  /**
   * Lists deal observations with attached product information and calculation results.
   */
  async listObservations(options?: { productId?: string; limit?: number }) {
    const limit = options?.limit ?? 20;

    const query = db
      .select({
        observation: productDealObservations,
        product: affiliateProducts,
      })
      .from(productDealObservations)
      .innerJoin(affiliateProducts, eq(productDealObservations.productId, affiliateProducts.id))
      .orderBy(desc(productDealObservations.observedAt))
      .limit(limit);

    if (options?.productId) {
      query.where(eq(productDealObservations.productId, options.productId));
    }

    const rows = await query;
    return rows;
  }
}

export const shopeeDealService = new ShopeeDealService();
