import { NextResponse } from "next/server";
import { schedulerService } from "@/services/scheduler.service";
import { sanitizeErrorMessage } from "@/lib/errors/sanitizer";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const health = await schedulerService.getSchedulerHealth();
    const recentRuns = await schedulerService.listRecentRuns(5);

    return NextResponse.json({
      health,
      recentRuns,
    });
  } catch (err) {
    const safeError = sanitizeErrorMessage(err, "Failed to retrieve scheduler health");
    return NextResponse.json({ error: safeError }, { status: 500 });
  }
}
