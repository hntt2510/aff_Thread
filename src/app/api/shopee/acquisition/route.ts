import { NextRequest, NextResponse } from "next/server";
import { shopeeIngestionService } from "@/services/shopee/shopee-ingestion.service";
import { sanitizeErrorMessage } from "@/lib/errors/sanitizer";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const limitParam = req.nextUrl.searchParams.get("limit");
    const limit = limitParam ? Math.min(50, Math.max(1, parseInt(limitParam, 10))) : 10;

    const [lastRun, recentRuns] = await Promise.all([
      shopeeIngestionService.getLastAcquisitionRun(),
      shopeeIngestionService.getRecentAcquisitionRuns(limit),
    ]);

    return NextResponse.json({
      success: true,
      lastRun,
      recentRuns,
    });
  } catch (err: unknown) {
    const safe = sanitizeErrorMessage(err, "Failed to fetch Shopee acquisition runs");
    return NextResponse.json({ success: false, error: safe }, { status: 500 });
  }
}
