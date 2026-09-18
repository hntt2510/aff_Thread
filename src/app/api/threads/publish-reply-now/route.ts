import { NextRequest, NextResponse } from "next/server";
import { threadsPublisherService } from "@/services/threads/threads-publisher.service";
import { sanitizeErrorMessage } from "@/lib/errors/sanitizer";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { replyId, postId } = body;

    if (!replyId && !postId) {
      return NextResponse.json(
        { success: false, error: "Missing required 'replyId' or 'postId' in request body." },
        { status: 400 }
      );
    }

    const result = await threadsPublisherService.publishReplyNow({
      replyId: typeof replyId === "string" ? replyId.trim() : undefined,
      postId: typeof postId === "string" ? postId.trim() : undefined,
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    const safeError = sanitizeErrorMessage(err, "Failed to publish affiliate reply to Threads");
    console.error("Error in publish-reply-now API:", safeError);
    return NextResponse.json(
      { success: false, error: safeError },
      { status: 400 }
    );
  }
}
