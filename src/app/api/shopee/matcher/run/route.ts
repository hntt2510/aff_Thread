import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { posts, affiliateProducts, affiliateProductOffers, productDealObservations } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { productMatcherService, MatcherCandidateItem } from "@/services/shopee/product-matcher.service";
import { weeklyPoolService, getCurrentIsoWeek } from "@/services/shopee/weekly-pool.service";
import { dealReplyComposerService } from "@/services/shopee/deal-reply-composer.service";
import { finalPriceCalculator } from "@/services/shopee/final-price-calculator";
import { sanitizeErrorMessage } from "@/lib/errors/sanitizer";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const postId = body.postId;
    const customText = body.customText || body.text;
    const week = body.week || getCurrentIsoWeek();
    const topN = body.topN ? parseInt(body.topN, 10) : 3;

    if (!postId && !customText) {
      return NextResponse.json({ success: false, error: "Missing postId or customText" }, { status: 400 });
    }

    let targetText = "";
    let targetPost: any = null;

    if (postId && postId !== "custom") {
      const [foundPost] = await db
        .select()
        .from(posts)
        .where(eq(posts.id, postId))
        .limit(1);
      targetPost = foundPost;
    }

    if (customText && typeof customText === "string" && customText.trim()) {
      targetText = customText.trim();
    } else if (targetPost?.text) {
      targetText = targetPost.text;
    } else {
      return NextResponse.json({ success: false, error: "No post text available for matching" }, { status: 400 });
    }

    // 2. Fetch candidates from weekly pool
    const poolItems = await weeklyPoolService.getPoolForWeek(week);

    // If pool is empty, fetch top active catalog items
    let candidates: MatcherCandidateItem[] = [];

    if (poolItems.length > 0) {
      // Gather latest deal observation for each candidate
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
            // Ignore parse errors
          }
        }

        // Prioritize s.shopee.vn short link
        const affUrl =
          (item.offer?.affiliateUrl?.includes("s.shopee.vn") ? item.offer.affiliateUrl : null) ||
          (item.product.productUrl?.includes("s.shopee.vn") ? item.product.productUrl : null) ||
          item.offer?.affiliateUrl ||
          item.product.productUrl;

        candidates.push({
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
      // Fallback: fetch directly from active products with offers
      const activeProdsWithOffers = await db
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
        .limit(30);

      const seen = new Set<string>();
      candidates = [];
      for (const row of activeProdsWithOffers) {
        if (seen.has(row.product.id)) continue;
        seen.add(row.product.id);

        const affUrl =
          (row.offer?.affiliateUrl?.includes("s.shopee.vn") ? row.offer.affiliateUrl : null) ||
          (row.product.productUrl?.includes("s.shopee.vn") ? row.product.productUrl : null) ||
          row.offer?.affiliateUrl ||
          row.product.productUrl;

        candidates.push({
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

    // 3. Run Product Matcher
    const rankedMatches = productMatcherService.rankCandidates(targetText, candidates, {
      topN,
      weights: body.weights,
    });

    // 4. Generate Dual-Persona Replies (HELPFUL_REVIEWER & COMBO_VALUE_HACKER)
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
        postText: targetText,
      });

      return {
        ...match,
        replyPreview: dual.recommendedPersona === "HELPFUL_REVIEWER" ? dual.helpfulReviewer : dual.comboValueHacker,
        replyReviewer: dual.helpfulReviewer,
        replyCombo: dual.comboValueHacker,
        recommendedPersona: dual.recommendedPersona,
        bundlePricing: dual.bundlePricing,
      };
    });

    const replyPreview = rankedMatchesWithPreview[0]?.replyPreview || null;
    const recommendedPersona = rankedMatchesWithPreview[0]?.recommendedPersona || "HELPFUL_REVIEWER";

    return NextResponse.json({
      success: true,
      post: targetPost
        ? {
            id: targetPost.id,
            text: targetText,
            status: targetPost.status,
          }
        : {
            id: "custom",
            text: targetText,
            status: "CUSTOM",
          },
      rankedMatches: rankedMatchesWithPreview,
      replyPreview,
      recommendedPersona,
    });
  } catch (err: unknown) {
    const safe = sanitizeErrorMessage(err, "Failed to run product matcher");
    return NextResponse.json({ success: false, error: safe }, { status: 400 });
  }
}
