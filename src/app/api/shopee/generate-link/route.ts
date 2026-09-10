import { NextRequest, NextResponse } from "next/server";
import { shopeeSessionService } from "@/services/shopee/shopee-session.service";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { originalUrl, subIds } = body;

    if (!originalUrl || typeof originalUrl !== "string" || !originalUrl.startsWith("http")) {
      return NextResponse.json(
        { success: false, error: "Valid Shopee URL (http/https) is required." },
        { status: 400 }
      );
    }

    const result = await shopeeSessionService.generateAffiliateLink(
      originalUrl,
      Array.isArray(subIds) ? subIds : undefined
    );

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error || "Failed to generate affiliate link",
          errorCategory: result.errorCategory,
          failCode: result.failCode,
        },
        { status: result.errorCategory === "AUTH_EXPIRED" ? 401 : 400 }
      );
    }

    return NextResponse.json({
      success: true,
      shortLink: result.shortLink,
      longLink: result.longLink,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, error: `Failed to generate link: ${message}` },
      { status: 500 }
    );
  }
}
