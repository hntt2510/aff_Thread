import { NextRequest, NextResponse } from "next/server";
import { tiktokTrendService } from "@/services/trends/tiktok-trend.service";
import { sanitizeErrorMessage } from "@/lib/errors/sanitizer";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // Allow empty body
    }

    const { query, region = "VN", count = 20, minViews = 100000, minLikes = 2000 } = body;
    const trimmedQuery = typeof query === "string" && query.trim() ? query.trim() : undefined;
    const parsedMinViews = Number(minViews) || 100000;
    const parsedMinLikes = Number(minLikes) || 2000;

    let candidates = [];
    if (trimmedQuery) {
      candidates = await tiktokTrendService.search(
        trimmedQuery,
        Number(count) || 20,
        region,
        parsedMinViews,
        parsedMinLikes
      );
    } else {
      candidates = await tiktokTrendService.fetchTrending(
        region || "VN",
        Number(count) || 20,
        parsedMinViews,
        parsedMinLikes
      );
    }

    // Enforce strict language & alphabet filtering and deduplication before responding
    candidates = tiktokTrendService.filterCandidatesByLanguageAndRegion(
      candidates,
      region,
      trimmedQuery
    );
    candidates = tiktokTrendService.deduplicateCandidates(candidates);

    return NextResponse.json({
      success: true,
      count: candidates.length,
      data: candidates,
      candidates,
      query: trimmedQuery || null,
      region,
    });
  } catch (err: unknown) {
    const safeMsg = sanitizeErrorMessage(err, "Failed to fetch viral trend videos");
    return NextResponse.json({ success: false, error: safeMsg }, { status: 500 });
  }
}
