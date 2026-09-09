import { NextRequest, NextResponse } from "next/server";
import { monetizationService } from "@/services/monetization.service";
import { sanitizeErrorMessage } from "@/lib/errors/sanitizer";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body.postId) {
      return NextResponse.json({ success: false, error: "Missing postId" }, { status: 400 });
    }

    if (!body.replies || !Array.isArray(body.replies) || body.replies.length === 0) {
      return NextResponse.json({ success: false, error: "Monetization plan must contain at least one reply" }, { status: 400 });
    }

    const result = await monetizationService.createPlan({
      postId: body.postId,
      source: body.source || "MANUAL",
      scheduledAt: body.scheduledAt || null,
      replies: body.replies,
    });

    return NextResponse.json({ success: true, ...result }, { status: 201 });
  } catch (err: unknown) {
    const safeError = sanitizeErrorMessage(err, "Failed to create monetization plan");
    return NextResponse.json({ success: false, error: safeError }, { status: 400 });
  }
}
