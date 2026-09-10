import { NextRequest, NextResponse } from "next/server";
import {
  shopeeTopOffersService,
  type RawShopeeProductItem,
  type MappedShopeeOffer,
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

    let sortedOffers: MappedShopeeOffer[] = [];
    let importType: "JSON" | "CSV" = "JSON";

    // 1. Check if CSV payload
    const csvContent = body.csvContent || body.csv;
    if (typeof csvContent === "string" && csvContent.trim().length > 0) {
      importType = "CSV";
      const parsedCsvOffers = shopeeTopOffersService.parseShopeeBatchCsv(csvContent);
      sortedOffers = parsedCsvOffers
        .filter((offer) => offer.itemId && offer.title && offer.rate > 0)
        .sort((a, b) => b.rate - a.rate);
    } else if (typeof body.rawData === "string") {
      const trimmed = body.rawData.trim();
      // If it looks like CSV rather than JSON
      if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
        const parsedCsvOffers = shopeeTopOffersService.parseShopeeBatchCsv(trimmed);
        if (parsedCsvOffers.length > 0) {
          importType = "CSV";
          sortedOffers = parsedCsvOffers
            .filter((offer) => offer.itemId && offer.title && offer.rate > 0)
            .sort((a, b) => b.rate - a.rate);
        }
      }
    }

    // 2. If not CSV, process as JSON
    if (sortedOffers.length === 0 && importType === "JSON") {
      const rawList: RawShopeeProductItem[] = shopeeTopOffersService.extractProductList(body);
      if (rawList.length > 0) {
        sortedOffers = shopeeTopOffersService.filterAndSortOffers(rawList);
      }
    }

    if (sortedOffers.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            importType === "CSV"
              ? "No valid product offers found in CSV or all commission rates are 0%."
              : "No product items found. Please provide an array of items or response from /api/v3/offer/product/list",
        },
        { status: 400 }
      );
    }

    // 3. Upsert into database
    const upsertResult = await shopeeTopOffersService.upsertTopOffers(sortedOffers);

    return NextResponse.json({
      success: true,
      message: `Successfully processed ${sortedOffers.length} top rate offers via ${importType}.`,
      count: sortedOffers.length,
      importType,
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
