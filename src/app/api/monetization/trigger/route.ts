import { NextRequest, NextResponse } from "next/server";
import { monetizationRunnerService } from "@/services/monetization-runner.service";
import { sanitizeErrorMessage } from "@/lib/errors/sanitizer";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest) {
  try {
    const result = await monetizationRunnerService.run({ triggerSource: "dashboard-manual" });
    return NextResponse.json({ success: true, result });
  } catch (err: unknown) {
    const safeError = sanitizeErrorMessage(err, "Failed to run monetization pass");
    return NextResponse.json({ success: false, error: safeError }, { status: 500 });
  }
}
