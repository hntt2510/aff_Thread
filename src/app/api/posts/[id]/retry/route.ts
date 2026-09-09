import { NextRequest, NextResponse } from "next/server";
import { postService } from "@/services/post.service";
import { sanitizeErrorMessage } from "@/lib/errors/sanitizer";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Post ID is required" }, { status: 400 });
    }

    const post = await postService.retryFailedPost(id);
    return NextResponse.json({ success: true, post });
  } catch (err) {
    const safeError = sanitizeErrorMessage(err, "Failed to retry post");
    return NextResponse.json({ error: safeError }, { status: 400 });
  }
}
