/**
 * Deal Opportunity Scoring Engine.
 * Evaluates whether a product constitutes a compelling time-sensitive deal right now
 * or at a targeted voucher activation window.
 * Strictly decoupled from Threads post engagement and general catalog quality.
 */

import { FinalPriceCalculationResult } from "./final-price-calculator";

export interface DealOpportunityInput {
  calculation: FinalPriceCalculationResult;
  originalPrice?: number | null;
  flashSale?: boolean | null;
  freeShipping?: boolean | null;
  commissionRate?: number | null; // e.g. 0.15 for 15%
  voucherMinSpend?: number | null;
  voucherMaxDiscount?: number | null;
}

export interface DealOpportunityBreakdown {
  score: number; // 0–100
  version: string;
  components: {
    effectiveDiscount: number; // Max 30
    voucherQuality: number; // Max 20
    priceAttractiveness: number; // Max 20
    urgency: number; // Max 15
    extraPerks: number; // Max 15
  };
  signalsUsed: Record<string, any>;
  missingSignals: string[];
  explanation: string;
}

export class DealOpportunityScoringService {
  readonly version = "v1.0.0-deal-opp";

  evaluate(input: DealOpportunityInput): DealOpportunityBreakdown {
    const { calculation } = input;
    const signalsUsed: Record<string, any> = {};
    const missingSignals: string[] = [];

    // If calculation is INVALID or EXPIRED, score is 0
    if (calculation.dealState === "INVALID" || calculation.dealState === "EXPIRED") {
      return {
        score: 0,
        version: this.version,
        components: {
          effectiveDiscount: 0,
          voucherQuality: 0,
          priceAttractiveness: 0,
          urgency: 0,
          extraPerks: 0,
        },
        signalsUsed: { dealState: calculation.dealState },
        missingSignals: ["activeOrUpcomingDeal"],
        explanation: `Deal Opportunity: 0/100 | Deal is ${calculation.dealState}`,
      };
    }

    const basePrice = calculation.basePrice;
    const finalPrice = calculation.estimatedFinalPrice;
    const discountAmount = calculation.discountAmount;

    // 1. Effective Discount Score (Max 30)
    let effectiveDiscountScore = 0;
    if (basePrice > 0) {
      const discountPct = (discountAmount / basePrice) * 100;
      signalsUsed.discountPct = `${discountPct.toFixed(1)}%`;

      if (discountPct >= 40) {
        effectiveDiscountScore = 30;
      } else if (discountPct >= 25) {
        effectiveDiscountScore = 24;
      } else if (discountPct >= 15) {
        effectiveDiscountScore = 18;
      } else if (discountPct >= 8) {
        effectiveDiscountScore = 10;
      } else if (discountPct > 0) {
        effectiveDiscountScore = 5;
      }
    } else {
      missingSignals.push("basePrice");
    }

    // 2. Voucher Quality (Max 20)
    // Low minimum spend relative to product price + generous cap
    let voucherQualityScore = 0;
    if (calculation.applicable === "YES" || calculation.applicable === "UNKNOWN") {
      signalsUsed.voucherApplied = true;
      let minSpendBonus = 10;
      if (input.voucherMinSpend && input.voucherMinSpend > 0) {
        const ratio = input.voucherMinSpend / basePrice;
        if (ratio <= 1.0) {
          minSpendBonus = 12; // Easily met with 1 item
        } else if (ratio <= 1.5) {
          minSpendBonus = 8;
        } else {
          minSpendBonus = 4;
        }
      }

      let capBonus = 8;
      if (input.voucherMaxDiscount && input.voucherMaxDiscount > 0) {
        if (input.voucherMaxDiscount >= 50000) capBonus = 8;
        else if (input.voucherMaxDiscount >= 20000) capBonus = 6;
        else capBonus = 3;
      }

      voucherQualityScore = Math.min(20, minSpendBonus + capBonus);
    } else {
      missingSignals.push("activeVoucher");
    }

    // 3. Price Attractiveness (Max 20)
    // Vietnamese consumer impulse purchase sweet spot (< 150k is very high, < 300k is good)
    let priceAttractivenessScore = 0;
    if (finalPrice > 0) {
      signalsUsed.finalPrice = finalPrice;
      if (finalPrice <= 99000) {
        priceAttractivenessScore = 20; // Under 100k impulse buy
      } else if (finalPrice <= 199000) {
        priceAttractivenessScore = 16;
      } else if (finalPrice <= 350000) {
        priceAttractivenessScore = 12;
      } else if (finalPrice <= 700000) {
        priceAttractivenessScore = 8;
      } else {
        priceAttractivenessScore = 5;
      }
    }

    // 4. Urgency & Timing (Max 15)
    let urgencyScore = 0;
    if (input.flashSale) {
      signalsUsed.flashSale = true;
      urgencyScore += 10;
    }

    if (calculation.dealState === "UPCOMING") {
      signalsUsed.isUpcoming = true;
      urgencyScore = Math.min(15, urgencyScore + 8); // Pre-sale anticipation
    } else if (calculation.evidence.voucherValidUntil) {
      const hoursUntilExpiry = (new Date(calculation.evidence.voucherValidUntil).getTime() - Date.now()) / (1000 * 60 * 60);
      if (hoursUntilExpiry > 0 && hoursUntilExpiry <= 6) {
        signalsUsed.expiringSoon = `${hoursUntilExpiry.toFixed(1)}h`;
        urgencyScore = Math.min(15, urgencyScore + 10);
      }
    }

    if (urgencyScore === 0) {
      urgencyScore = 4; // Baseline standard deal
    }

    // 5. Extra Perks (Max 15)
    let extraPerksScore = 0;
    if (input.freeShipping) {
      signalsUsed.freeShipping = true;
      extraPerksScore += 8;
    }

    const rawComm = input.commissionRate;
    const commRate =
      rawComm !== null && rawComm !== undefined
        ? rawComm > 1.0
          ? rawComm / 100
          : rawComm
        : null;

    if (commRate && commRate >= 0.10) {
      signalsUsed.highCommission = `${(commRate * 100).toFixed(1)}%`;
      extraPerksScore += 7;
    } else if (commRate && commRate >= 0.05) {
      extraPerksScore += 4;
    }

    const totalScore = Math.min(
      100,
      Math.max(
        0,
        effectiveDiscountScore +
          voucherQualityScore +
          priceAttractivenessScore +
          urgencyScore +
          extraPerksScore
      )
    );

    const explanation = `Deal Opportunity: ${totalScore}/100 | Discount: +${effectiveDiscountScore}, Voucher: +${voucherQualityScore}, Price: +${priceAttractivenessScore}, Urgency: +${urgencyScore}, Perks: +${extraPerksScore}`;

    return {
      score: totalScore,
      version: this.version,
      components: {
        effectiveDiscount: effectiveDiscountScore,
        voucherQuality: voucherQualityScore,
        priceAttractiveness: priceAttractivenessScore,
        urgency: urgencyScore,
        extraPerks: extraPerksScore,
      },
      signalsUsed,
      missingSignals,
      explanation,
    };
  }
}

export const dealOpportunityScoringService = new DealOpportunityScoringService();
