import { NextResponse } from "next/server";
import { threadsPublisherService } from "@/services/threads/threads-publisher.service";
import { sanitizeErrorMessage } from "@/lib/errors/sanitizer";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await threadsPublisherService.checkAndTriggerMilestoneReplies();
    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (err: unknown) {
    const safeError = sanitizeErrorMessage(err, "Failed to check milestone replies");
    console.error("Error in check-milestones API:", safeError);
    return NextResponse.json(
      { success: false, error: safeError },
      { status: 500 }
    );
  }
}

export async function GET() {
  return POST();
}
