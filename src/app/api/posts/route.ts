import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { postService } from "@/services/post.service";
import { sanitizeErrorMessage } from "@/lib/errors/sanitizer";
import { isValidPostStatus, PostStatus } from "@/lib/posts/lifecycle";

export const dynamic = "force-dynamic";

const postPayloadSchema = z.object({
  accountId: z.string().min(1, "Account ID is required"),
  text: z.string().min(1, "Post text cannot be empty").max(500, "Text exceeds 500 characters"),
  mode: z.enum(["now", "schedule"]).default("now"),
  scheduledAt: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const statusParam = searchParams.get("status");
    const accountId = searchParams.get("accountId") || undefined;
    const limitParam = searchParams.get("limit");

    const limit = limitParam ? parseInt(limitParam, 10) : 100;
    const safeLimit = isNaN(limit) || limit <= 0 ? 100 : Math.min(limit, 200);

    let status: PostStatus | undefined;
    if (statusParam && isValidPostStatus(statusParam)) {
      status = statusParam;
    }

    const posts = await postService.listPosts({
      status,
      accountId,
      limit: safeLimit,
    });

    return NextResponse.json({ posts });
  } catch (err) {
    const safeError = sanitizeErrorMessage(err, "Failed to retrieve post history");
    return NextResponse.json({ error: safeError }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = postPayloadSchema.safeParse(body);

    if (!parsed.success) {
      const errorMsg = parsed.error.issues[0]?.message || "Invalid post payload";
      return NextResponse.json({ error: errorMsg }, { status: 400 });
    }

    const { accountId, text, mode, scheduledAt } = parsed.data;

    if (mode === "schedule") {
      if (!scheduledAt) {
        return NextResponse.json(
          { error: "Scheduled date and time are required for scheduling" },
          { status: 400 }
        );
      }

      const scheduledDate = new Date(scheduledAt);
      if (isNaN(scheduledDate.getTime())) {
        return NextResponse.json(
          { error: "Invalid scheduled date timestamp format" },
          { status: 400 }
        );
      }

      const post = await postService.schedulePost(accountId, text, scheduledDate);
      return NextResponse.json({ success: true, post }, { status: 201 });
    }

    // Default: publish now
    const post = await postService.publishTextPost(accountId, text);
    return NextResponse.json({ success: true, post }, { status: 201 });
  } catch (err) {
    const safeError = sanitizeErrorMessage(err, "Failed to create or publish post");
    return NextResponse.json({ error: safeError }, { status: 400 });
  }
}
