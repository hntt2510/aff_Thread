import { NextRequest, NextResponse } from "next/server";
import { tiktokTrendService, generateBaitCaption } from "@/services/trends/tiktok-trend.service";
import { weeklyPoolService, getCurrentIsoWeek } from "@/services/shopee/weekly-pool.service";
import { productMatcherService, MatcherCandidateItem } from "@/services/shopee/product-matcher.service";
import { dealReplyComposerService } from "@/services/shopee/deal-reply-composer.service";
import { finalPriceCalculator } from "@/services/shopee/final-price-calculator";
import { db } from "@/db";
import { productDealObservations, affiliateProducts, affiliateProductOffers } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { sanitizeErrorMessage } from "@/lib/errors/sanitizer";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { videoTitle, videoUrl, coverUrl, videoId, targetWeek } = body as {
      videoTitle: string;
      videoUrl: string;
      coverUrl: string;
      videoId: string;
      targetWeek?: string;
    };

    if (!videoTitle || !videoUrl) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: videoTitle and videoUrl are required." },
        { status: 400 }
      );
    }

    const week = targetWeek || getCurrentIsoWeek();

    // Step A: Generate Bait Caption (LLM or conversational hook rewriter)
    const baitCaption = await generateBaitCaption(videoTitle);

    // Step B: Affiliate Deal Matcher (Match against Weekly Pool / active catalog products)
    const poolItems = await weeklyPoolService.getPoolForWeek(week);
    let poolCandidates: MatcherCandidateItem[] = [];

    if (poolItems.length > 0) {
      for (const item of poolItems) {
        const [dealObs] = await db
          .select()
          .from(productDealObservations)
          .where(eq(productDealObservations.productId, item.product.id))
          .orderBy(desc(productDealObservations.observedAt))
          .limit(1);

        let dealOpportunityScore = 50;
        let dealCalculation: any = undefined;
        if (dealObs?.rawMetadataJson) {
          try {
            const meta = JSON.parse(dealObs.rawMetadataJson);
            if (meta.dealOpportunity?.score) {
              dealOpportunityScore = meta.dealOpportunity.score;
            }
            if (meta.calculation) {
              dealCalculation = meta.calculation;
            }
          } catch {
            // ignore JSON parse errors
          }
        }

        const affUrl =
          (item.offer?.affiliateUrl?.includes("s.shopee.vn") ? item.offer.affiliateUrl : null) ||
          (item.product.productUrl?.includes("s.shopee.vn") ? item.product.productUrl : null) ||
          item.offer?.affiliateUrl ||
          item.product.productUrl;

        poolCandidates.push({
          id: item.product.id,
          title: item.product.title,
          category: item.product.category,
          productUrl: item.product.productUrl,
          affiliateUrl: affUrl,
          imageUrl: item.product.imageUrl,
          catalogScore: item.poolItem.catalogScore,
          dealOpportunityScore,
          dealCalculation,
          price: dealObs?.observedPrice || dealCalculation?.observedPrice || dealCalculation?.finalPrice || null,
        });
      }
    } else {
      // Fallback: active products with offers
      const activeProds = await db
        .select({
          product: affiliateProducts,
          offer: affiliateProductOffers,
        })
        .from(affiliateProducts)
        .leftJoin(
          affiliateProductOffers,
          and(
            eq(affiliateProductOffers.productId, affiliateProducts.id),
            eq(affiliateProductOffers.isActive, true)
          )
        )
        .where(eq(affiliateProducts.isActive, true))
        .orderBy(desc(affiliateProducts.updatedAt))
        .limit(20);

      for (const row of activeProds) {
        const affUrl =
          (row.offer?.affiliateUrl?.includes("s.shopee.vn") ? row.offer.affiliateUrl : null) ||
          (row.product.productUrl?.includes("s.shopee.vn") ? row.product.productUrl : null) ||
          row.offer?.affiliateUrl ||
          row.product.productUrl;

        poolCandidates.push({
          id: row.product.id,
          title: row.product.title,
          category: row.product.category,
          productUrl: row.product.productUrl,
          affiliateUrl: affUrl,
          imageUrl: row.product.imageUrl,
          catalogScore: 60,
          dealOpportunityScore: 50,
          price: null,
        });
      }
    }

    // Match video title & bait caption against pool candidates
    const matchContext = `${videoTitle} ${baitCaption}`.trim();
    const rankedMatches = productMatcherService.rankCandidates(matchContext, poolCandidates, {
      topN: 1,
    });

    let matchedProduct: {
      id: string;
      name: string;
      price: number;
      shopVoucherCode?: string;
      shopDiscountAmount?: number;
      replyReviewer: string;
      replyCombo: string;
      recommendedPersona: "HELPFUL_REVIEWER" | "COMBO_VALUE_HACKER";
      affiliateUrl: string;
    } | null = null;

    if (rankedMatches.length > 0) {
      const topMatch = rankedMatches[0];
      const calculation =
        topMatch.product.dealCalculation ||
        finalPriceCalculator.calculate({
          observedPrice: topMatch.product.price || 100000,
          userEligibility: "UNKNOWN",
        });

      const productItem = {
        title: topMatch.product.title,
        directAffiliateUrl: topMatch.product.affiliateUrl,
        calculation,
        voucherCode: topMatch.product.voucherCode ?? calculation.evidence?.voucherCode,
        discountRate: topMatch.product.discountRate,
      };

      const dual = dealReplyComposerService.composeDualPersonaReplies(productItem, {
        postText: matchContext,
      });

      const finalPrice =
        calculation.estimatedFinalPrice ||
        topMatch.product.price ||
        calculation.basePrice ||
        100000;

      const rawVoucher = topMatch.product.voucherCode ?? calculation.evidence?.voucherCode;
      const voucherCode = typeof rawVoucher === "string" ? rawVoucher.trim() : undefined;
      const discountAmount = calculation.discountAmount > 0 ? calculation.discountAmount : undefined;

      matchedProduct = {
        id: topMatch.product.id,
        name: topMatch.product.title,
        price: finalPrice,
        shopVoucherCode: voucherCode,
        shopDiscountAmount: discountAmount,
        replyReviewer: dual.helpfulReviewer.text,
        replyCombo: dual.comboValueHacker.text,
        recommendedPersona: dual.recommendedPersona,
        affiliateUrl: topMatch.product.affiliateUrl,
      };
    }

    return NextResponse.json({
      success: true,
      draft: {
        baitCaption,
        mediaUrl: videoUrl,
        coverUrl,
        videoId,
        matchedProduct,
      },
    });
  } catch (err: unknown) {
    const safeMsg = sanitizeErrorMessage(err, "Failed to generate trend draft");
    return NextResponse.json({ success: false, error: safeMsg }, { status: 500 });
  }
}
