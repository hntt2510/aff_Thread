import { NextResponse } from "next/server";
import { affiliateService } from "@/services/affiliate.service";
import { sanitizeErrorMessage } from "@/lib/errors/sanitizer";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const analytics = await affiliateService.getAnalytics();
    return NextResponse.json(analytics);
  } catch (err) {
    const safeError = sanitizeErrorMessage(err, "Failed to retrieve affiliate analytics");
    return NextResponse.json({ error: safeError }, { status: 500 });
  }
}
