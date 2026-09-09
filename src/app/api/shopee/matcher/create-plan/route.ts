import { NextRequest, NextResponse } from "next/server";
import { monetizationService } from "@/services/monetization.service";
import { sanitizeErrorMessage } from "@/lib/errors/sanitizer";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { postId, replyText, directAffiliateUrl, targetPublishAt } = body;

    if (!postId || !replyText) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: postId, replyText" },
        { status: 400 }
      );
    }

    // Create DRAFT monetization plan
    const planResult = await monetizationService.createPlan({
      postId,
      source: "SHOPEE_DEAL_ENGINE",
      scheduledAt: targetPublishAt || null,
      replies: [
        {
          sequenceNo: 1,
          scheduledAt: targetPublishAt || null,
          replyText: replyText.trim(),
          links: directAffiliateUrl
            ? [
                {
                  destinationUrl: directAffiliateUrl.trim(),
                  metadataJson: JSON.stringify({
                    platform: "shopee",
                    affiliateType: "DIRECT",
                    isDirectShopee: true,
                  }),
                },
              ]
            : [],
        },
      ],
    });

    return NextResponse.json({
      success: true,
      plan: planResult.plan,
      message: "Draft monetization plan created. Ready for safe operator review or publishing.",
    }, { status: 201 });
  } catch (err: unknown) {
    const safe = sanitizeErrorMessage(err, "Failed to create monetization plan from match");
    return NextResponse.json({ success: false, error: safe }, { status: 400 });
  }
}
