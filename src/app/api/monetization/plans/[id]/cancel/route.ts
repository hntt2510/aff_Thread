import { NextRequest, NextResponse } from "next/server";
import { monetizationService } from "@/services/monetization.service";
import { sanitizeErrorMessage } from "@/lib/errors/sanitizer";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ success: false, error: "Missing plan ID" }, { status: 400 });
    }

    const plan = await monetizationService.cancelPlan(id);
    return NextResponse.json({ success: true, plan });
  } catch (err: unknown) {
    const safeError = sanitizeErrorMessage(err, "Failed to cancel plan");
    return NextResponse.json({ success: false, error: safeError }, { status: 500 });
  }
}
