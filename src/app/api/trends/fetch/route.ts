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
      candidates = await tiktokTrendService.searchViralVideos({
        query: query.trim(),
        region,
        count: Number(count) || 20,
        minViews: Number(minViews) || 50000,
        minLikes: Number(minLikes) || 2000,
      });
    } else {
      candidates = await tiktokTrendService.fetchTrendingVideos({
        region,
        count: Number(count) || 20,
        minViews: Number(minViews) || 50000,
        minLikes: Number(minLikes) || 2000,
      });
    }

    return NextResponse.json({
      success: true,
      count: candidates.length,
      candidates,
      query: query || null,
      region,
    });
  } catch (err: unknown) {
    const safeMsg = sanitizeErrorMessage(err, "Failed to fetch viral trend videos");
    return NextResponse.json({ success: false, error: safeMsg }, { status: 500 });
  }
}
