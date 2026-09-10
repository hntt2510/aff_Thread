import { NextRequest, NextResponse } from "next/server";
import {
  shopeeTopOffersService,
  type RawShopeeProductItem,
} from "@/services/shopee/shopee-top-offers.service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;

    const search = searchParams.get("search") || undefined;
    const minPriceParam = searchParams.get("minPrice");
    const maxPriceParam = searchParams.get("maxPrice");
    const minRateParam = searchParams.get("minRate");
    const sortBy = (searchParams.get("sortBy") as any) || "rate_desc";
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "24", 10);

    const minPrice = minPriceParam !== null ? parseInt(minPriceParam, 10) : undefined;
    const maxPrice = maxPriceParam !== null ? parseInt(maxPriceParam, 10) : undefined;
    const minRate = minRateParam !== null ? parseFloat(minRateParam) : undefined;

    const result = await shopeeTopOffersService.listTopOffers({
      search,
      minPrice,
      maxPrice,
      minRate,
      sortBy,
      page,
      limit,
    });

    return NextResponse.json({
      success: true,
      items: result.items,
      total: result.total,
      page,
      limit,
      stats: result.stats,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, error: `Failed to fetch top rate offers: ${message}` },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    let rawList: RawShopeeProductItem[] = [];

    if (Array.isArray(body)) {
      rawList = body;
    } else if (Array.isArray(body.list)) {
      rawList = body.list;
    } else if (Array.isArray(body.data?.list)) {
      rawList = body.data.list;
    } else if (Array.isArray(body.data)) {
      rawList = body.data;
    } else if (typeof body.jsonContent === "string") {
      try {
        const parsed = JSON.parse(body.jsonContent.trim());
        if (Array.isArray(parsed)) {
          rawList = parsed;
        } else if (Array.isArray(parsed.data?.list)) {
          rawList = parsed.data.list;
        } else if (Array.isArray(parsed.list)) {
          rawList = parsed.list;
        }
      } catch {
        return NextResponse.json(
          { success: false, error: "Invalid JSON string provided in jsonContent" },
          { status: 400 }
        );
      }
    } else if (body.item_id || body.batch_item_for_item_card_full) {
      // Single item
      rawList = [body];
    }

    if (rawList.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "No product items found. Please provide an array of items or response from /api/v3/offer/product/list",
        },
        { status: 400 }
      );
    }

    // 1. Transform, filter (rate > 0), sort by rate desc
    const sortedOffers = shopeeTopOffersService.filterAndSortOffers(rawList);

    if (sortedOffers.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "All provided items had 0% or missing commission rates.",
        },
        { status: 400 }
      );
    }

    // 2. Upsert into database
    const upsertResult = await shopeeTopOffersService.upsertTopOffers(sortedOffers);

    return NextResponse.json({
      success: true,
      message: `Successfully processed ${sortedOffers.length} top rate offers.`,
      count: sortedOffers.length,
      upsertResult,
      topOffers: sortedOffers.slice(0, 5),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, error: `Failed to import offers: ${message}` },
      { status: 500 }
    );
  }
}
