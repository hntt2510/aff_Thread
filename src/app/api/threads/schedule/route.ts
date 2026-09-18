import { NextRequest, NextResponse } from "next/server";
import { threadsPublisherService } from "@/services/threads/threads-publisher.service";
import { sanitizeErrorMessage } from "@/lib/errors/sanitizer";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { postId, scheduledAt } = body;

    if (!postId || typeof postId !== "string" || !postId.trim()) {
      return NextResponse.json(
        { success: false, error: "Missing required 'postId' field." },
        { status: 400 }
      );
    }

    if (!scheduledAt) {
      return NextResponse.json(
        { success: false, error: "Missing required 'scheduledAt' timestamp." },
        { status: 400 }
      );
    }

    const post = await threadsPublisherService.schedulePost(postId.trim(), scheduledAt);
    return NextResponse.json({
      success: true,
      post,
      message: `Post scheduled for ${new Date(scheduledAt).toISOString()}`,
    });
  } catch (err: unknown) {
    const safeError = sanitizeErrorMessage(err, "Failed to schedule post");
    console.error("Error in schedule API:", safeError);
    return NextResponse.json(
      { success: false, error: safeError },
      { status: 400 }
    );
  }
}
