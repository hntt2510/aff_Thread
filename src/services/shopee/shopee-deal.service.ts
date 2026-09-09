import { db } from "@/db";
import {
  productDealObservations,
  affiliateProducts,
  affiliateProductOffers,
  ProductDealObservation,
} from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { finalPriceCalculator, PriceCalculationInput, FinalPriceCalculationResult } from "./final-price-calculator";
import { dealOpportunityScoringService, DealOpportunityBreakdown } from "./deal-opportunity-scoring.service";

export interface RecordDealObservationInput {
  productId: string;
  offerId?: string | null;
  observedPrice: number;
  originalPrice?: number | null;
  currency?: string;
  voucherCode?: string | null;
  voucherType?: string | null;
  voucherDiscountType?: "PERCENT" | "FIXED" | null;
  voucherDiscountPercent?: number | null;
  voucherDiscountAmount?: number | null;
  voucherMaxDiscount?: number | null;
  voucherMinSpend?: number | null;
  voucherValidFrom?: Date | string | null;
  voucherValidUntil?: Date | string | null;
  flashSale?: boolean;
  freeShipping?: boolean;
  availabilityStatus?: string;
  source?: string;
}

export class ShopeeDealService {
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

    // 1. Run deterministic price calculation
    const calcInput: PriceCalculationInput = {
      observedPrice: input.observedPrice,
      originalPrice: input.originalPrice,
      voucherCode: input.voucherCode,
      voucherType: input.voucherType,
      voucherDiscountType: input.voucherDiscountType,
      voucherDiscountPercent: input.voucherDiscountPercent,
      voucherDiscountAmount: input.voucherDiscountAmount,
      voucherMaxDiscount: input.voucherMaxDiscount,
      voucherMinSpend: input.voucherMinSpend,
      voucherValidFrom: input.voucherValidFrom,
      voucherValidUntil: input.voucherValidUntil,
      evaluationTime: now,
    };

    const calculation = finalPriceCalculator.calculate(calcInput);

    // 2. Assess Deal Opportunity Score
    const dealOpportunity = dealOpportunityScoringService.evaluate({
      calculation,
      originalPrice: input.originalPrice,
      flashSale: input.flashSale,
      freeShipping: input.freeShipping,
      voucherMinSpend: input.voucherMinSpend,
      voucherMaxDiscount: input.voucherMaxDiscount,
    });

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
