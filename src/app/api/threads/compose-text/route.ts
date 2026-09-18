import { NextRequest, NextResponse } from "next/server";
import { textThreadComposerService } from "@/services/threads/text-thread-composer.service";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      productName,
      category,
      niche,
      archetype,
      productFeatures,
      painPoints,
      personalExperience,
      voucherCode,
      voucherDiscount,
      priceFormatted,
      affiliateUrl,
    } = body;

    if (!productName || typeof productName !== "string" || !productName.trim()) {
      return NextResponse.json(
        { success: false, error: "Missing required 'productName' field." },
        { status: 400 }
      );
    }

    if (!affiliateUrl || typeof affiliateUrl !== "string" || !affiliateUrl.trim()) {
      return NextResponse.json(
        { success: false, error: "Missing required 'affiliateUrl' field." },
        { status: 400 }
      );
    }

    const result = await textThreadComposerService.composeThread({
      productName: productName.trim(),
      category: typeof category === "string" ? category.trim() : undefined,
      niche: niche || "SKINCARE",
      archetype: archetype || "REGRET_EXPERIENCE",
      productFeatures: Array.isArray(productFeatures) ? productFeatures : undefined,
      painPoints: Array.isArray(painPoints) ? painPoints : undefined,
      personalExperience: typeof personalExperience === "string" ? personalExperience.trim() : undefined,
      voucherCode: typeof voucherCode === "string" ? voucherCode.trim() : undefined,
      voucherDiscount: typeof voucherDiscount === "string" ? voucherDiscount.trim() : undefined,
      priceFormatted: typeof priceFormatted === "string" ? priceFormatted.trim() : undefined,
      affiliateUrl: affiliateUrl.trim(),
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Error in compose-text API:", message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
