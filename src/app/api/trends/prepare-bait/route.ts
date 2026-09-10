import { NextRequest, NextResponse } from "next/server";
import { tiktokTrendService, ViralContentCandidate } from "@/services/trends/tiktok-trend.service";
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
    const { candidate, targetWeek } = body as {
      candidate: ViralContentCandidate;
      targetWeek?: string;
    };

    if (!candidate || !candidate.id) {
      return NextResponse.json(
        { success: false, error: "Missing candidate video data" },
        { status: 400 }
      );
    }

    const week = targetWeek || getCurrentIsoWeek();

    // 1. Generate optimized Vietnamese Threads conversational bait hook
    const rewrittenCaption = tiktokTrendService.rewriteCaptionForThreads(candidate.title, {
      author: candidate.author?.nickname,
    });

    // 2. Fetch candidates from weekly pool
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
            // ignore
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

    // 3. Match candidate video caption against pool products
    const matchTargetText = candidate.title ? `${candidate.title} ${rewrittenCaption}` : rewrittenCaption;
    const rankedMatches = productMatcherService.rankCandidates(matchTargetText, poolCandidates, {
      topN: 3,
    });

    // 4. Generate Dual-Persona reply previews for each matched candidate
    const rankedMatchesWithPreview = rankedMatches.map((match) => {
      const calculation =
        match.product.dealCalculation ||
        finalPriceCalculator.calculate({
          observedPrice: match.product.price || 100000,
          userEligibility: "UNKNOWN",
        });

      const productItem = {
        title: match.product.title,
        directAffiliateUrl: match.product.affiliateUrl,
        calculation,
        voucherCode: match.product.voucherCode ?? calculation.evidence?.voucherCode,
        discountRate: match.product.discountRate,
      };

      const dual = dealReplyComposerService.composeDualPersonaReplies(productItem, {
        postText: matchTargetText,
      });

      return {
        ...match,
        replyReviewer: dual.helpfulReviewer.text,
        replyCombo: dual.comboValueHacker.text,
        recommendedPersona: dual.recommendedPersona,
        bundlePricing: dual.bundlePricing,
      };
    });

    const recommendedPersona = rankedMatchesWithPreview[0]?.recommendedPersona || "HELPFUL_REVIEWER";

    return NextResponse.json({
      success: true,
      candidate,
      rewrittenCaption,
      matchedDeals: rankedMatchesWithPreview,
      recommendedPersona,
    });
  } catch (err: unknown) {
    const safeMsg = sanitizeErrorMessage(err, "Failed to prepare bait post and match deals");
    return NextResponse.json({ success: false, error: safeMsg }, { status: 500 });
  }
}
