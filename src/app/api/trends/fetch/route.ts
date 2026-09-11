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

    const { query, region = "VN", count = 20, minViews = 50000, minLikes = 2000 } = body;

    let candidates = [];
    if (query && typeof query === "string" && query.trim()) {
      candidates = await tiktokTrendService.search(
        query.trim(),
        Number(count) || 20,
        region
      );
    } else {
      candidates = await tiktokTrendService.fetchTrending(
        region || "VN",
        Number(count) || 20
      );
    }

    return NextResponse.json({
      success: true,
      count: candidates.length,
      data: candidates,
      candidates,
      query: query || null,
      region,
    });
  } catch (err: unknown) {
    const safeMsg = sanitizeErrorMessage(err, "Failed to fetch viral trend videos");
    return NextResponse.json({ success: false, error: safeMsg }, { status: 500 });
  }
}
