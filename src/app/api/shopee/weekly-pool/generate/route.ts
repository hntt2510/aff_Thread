import { NextRequest, NextResponse } from "next/server";
import { weeklyPoolService, getCurrentIsoWeek } from "@/services/shopee/weekly-pool.service";
import { sanitizeErrorMessage } from "@/lib/errors/sanitizer";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // Body optional
    }

    const week = body.week || getCurrentIsoWeek();
    const targetPoolSize = body.targetPoolSize ? parseInt(body.targetPoolSize, 10) : 60;
    const maxPerCategory = body.maxPerCategory ? parseInt(body.maxPerCategory, 10) : 15;

    const pool = await weeklyPoolService.generateWeeklyPool(week, {
      targetPoolSize,
      maxPerCategory,
    });

    return NextResponse.json({
      success: true,
      week,
      count: pool.length,
      pool,
    });
  } catch (err: unknown) {
    const safe = sanitizeErrorMessage(err, "Failed to generate weekly product pool");
    return NextResponse.json({ success: false, error: safe }, { status: 400 });
  }
}
