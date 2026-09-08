import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { postService } from "@/services/post.service";
import { sanitizeErrorMessage } from "@/lib/errors/sanitizer";

export const dynamic = "force-dynamic";

const publishSchema = z.object({
  accountId: z.string().min(1, "Account ID is required"),
  text: z.string().min(1, "Post text cannot be empty").max(500, "Text exceeds 500 characters"),
});

export async function GET() {
  try {
    const posts = await postService.listPosts(100);
    return NextResponse.json({ posts });
  } catch (err) {
    const safeError = sanitizeErrorMessage(err, "Failed to retrieve post history");
    return NextResponse.json({ error: safeError }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = publishSchema.safeParse(body);

    if (!parsed.success) {
      const errorMsg = parsed.error.issues[0]?.message || "Invalid publish payload";
      return NextResponse.json({ error: errorMsg }, { status: 400 });
    }

    const post = await postService.publishTextPost(
      parsed.data.accountId,
      parsed.data.text
    );

    return NextResponse.json({ success: true, post }, { status: 201 });
  } catch (err) {
    const safeError = sanitizeErrorMessage(err, "Publishing failed");
    return NextResponse.json({ error: safeError }, { status: 400 });
  }
}
