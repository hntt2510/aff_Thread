import { NextRequest, NextResponse } from "next/server";
import { shopeeCatalogService } from "@/services/shopee/shopee-catalog.service";
import { sanitizeErrorMessage } from "@/lib/errors/sanitizer";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const search = searchParams.get("search") || undefined;
    const category = searchParams.get("category") || undefined;
    const activeOnly = searchParams.get("activeOnly") === "true";

    const result = await shopeeCatalogService.listProducts({
      page,
      limit,
      search,
      category,
      activeOnly,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err: unknown) {
    const safe = sanitizeErrorMessage(err, "Failed to list Shopee products");
    return NextResponse.json({ success: false, error: safe }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body.title || !body.productUrl || !body.affiliateUrl) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: title, productUrl, affiliateUrl" },
        { status: 400 }
      );
    }

    const result = await shopeeCatalogService.createManualProduct({
      title: body.title,
      productUrl: body.productUrl,
      affiliateUrl: body.affiliateUrl,
      category: body.category,
      imageUrl: body.imageUrl,
      commissionRate: body.commissionRate ? parseFloat(body.commissionRate) : undefined,
      soldCount: body.soldCount ? parseInt(body.soldCount, 10) : undefined,
    });

    return NextResponse.json({ success: true, ...result }, { status: 201 });
  } catch (err: unknown) {
    const safe = sanitizeErrorMessage(err, "Failed to create product");
    return NextResponse.json({ success: false, error: safe }, { status: 400 });
  }
}
