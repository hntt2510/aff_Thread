import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { posts, affiliateProducts, affiliateProductOffers, productDealObservations } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
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
    const week = body.week || getCurrentIsoWeek();
    const topN = body.topN ? parseInt(body.topN, 10) : 3;

    if (!postId) {
      return NextResponse.json({ success: false, error: "Missing postId" }, { status: 400 });
    }

    // 1. Fetch target post
    const [targetPost] = await db
      .select()
      .from(posts)
      .where(eq(posts.id, postId))
      .limit(1);

    if (!targetPost) {
      return NextResponse.json({ success: false, error: "Post not found" }, { status: 404 });
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
        if (dealObs?.rawMetadataJson) {
          try {
            const meta = JSON.parse(dealObs.rawMetadataJson);
            if (meta.dealOpportunity?.score) {
              dealOpportunityScore = meta.dealOpportunity.score;
            }
          } catch {
            // Ignore parse errors
          }
        }

        candidates.push({
          id: item.product.id,
          title: item.product.title,
          category: item.product.category,
          productUrl: item.product.productUrl,
          affiliateUrl: item.offer?.affiliateUrl || item.product.productUrl,
          imageUrl: item.product.imageUrl,
          catalogScore: item.poolItem.catalogScore,
          dealOpportunityScore,
        });
      }
    } else {
      // Fallback: fetch directly from active products
      const activeProds = await db
        .select()
        .from(affiliateProducts)
        .where(eq(affiliateProducts.isActive, true))
        .limit(20);

      candidates = activeProds.map((p) => ({
        id: p.id,
        title: p.title,
        category: p.category,
        productUrl: p.productUrl,
        affiliateUrl: p.productUrl,
        imageUrl: p.imageUrl,
        catalogScore: 60,
        dealOpportunityScore: 50,
      }));
    }

    // 3. Run Product Matcher
    const rankedMatches = productMatcherService.rankCandidates(targetPost.text || "", candidates, {
      topN,
      weights: body.weights,
    });

    // 4. Generate Reply Preview for Top Candidate
    let replyPreview: any = null;
    if (rankedMatches.length > 0) {
      const topMatch = rankedMatches[0];
      const calculation = finalPriceCalculator.calculate({
        observedPrice: 150000, // Baseline or from deal observation
        voucherDiscountType: "PERCENT",
        voucherDiscountPercent: 20,
      });

      const composed = dealReplyComposerService.composeReply([
        {
          title: topMatch.product.title,
          directAffiliateUrl: topMatch.product.affiliateUrl,
          calculation,
          voucherDiscountPercent: 20,
        },
      ]);
      replyPreview = composed;
    }

    return NextResponse.json({
      success: true,
      post: {
        id: targetPost.id,
        text: targetPost.text,
        status: targetPost.status,
      },
      rankedMatches,
      replyPreview,
    });
  } catch (err: unknown) {
    const safe = sanitizeErrorMessage(err, "Failed to run product matcher");
    return NextResponse.json({ success: false, error: safe }, { status: 400 });
  }
}
