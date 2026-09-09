import { NextRequest, NextResponse } from "next/server";
import { weeklyPoolService, getCurrentIsoWeek } from "@/services/shopee/weekly-pool.service";
import { sanitizeErrorMessage } from "@/lib/errors/sanitizer";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const week = searchParams.get("week") || getCurrentIsoWeek();

    const pool = await weeklyPoolService.getPoolForWeek(week);
    const availableWeeks = await weeklyPoolService.listAvailableWeeks();

    return NextResponse.json({
      success: true,
      week,
      pool,
      availableWeeks,
      total: pool.length,
    });
  } catch (err: unknown) {
    const safe = sanitizeErrorMessage(err, "Failed to load weekly product pool");
    return NextResponse.json({ success: false, error: safe }, { status: 500 });
  }
}
