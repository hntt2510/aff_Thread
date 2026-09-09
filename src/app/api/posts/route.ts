import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { postService } from "@/services/post.service";
import { sanitizeErrorMessage } from "@/lib/errors/sanitizer";
import { isValidPostStatus, PostStatus } from "@/lib/posts/lifecycle";

export const dynamic = "force-dynamic";

const mediaItemSchema = z.object({
  mediaKind: z.enum(["IMAGE", "VIDEO"]),
  sourceUrl: z.string().min(1, "Media source URL is required"),
  altText: z.string().max(1000).optional(),
});

const postPayloadSchema = z.object({
  accountId: z.string().min(1, "Account ID is required"),
  text: z.string().max(500, "Text exceeds 500 characters").optional().default(""),
  mediaType: z.enum(["TEXT", "IMAGE", "VIDEO", "CAROUSEL"]).default("TEXT"),
  mediaItems: z.array(mediaItemSchema).optional().default([]),
  affiliateLinkIds: z.array(z.string()).optional(),
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

    const {
      accountId,
      text,
      mediaType,
      mediaItems,
      affiliateLinkIds,
      mode,
      scheduledAt,
    } = parsed.data;

    if (mediaType === "TEXT" && (!text || !text.trim())) {
      return NextResponse.json(
        { error: "Post text cannot be empty for text posts" },
        { status: 400 }
      );
    }

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

      const post = await postService.schedulePost({
        accountId,
        text,
        mediaType,
        mediaItems,
        affiliateLinkIds,
        scheduledAt: scheduledDate,
      });
      return NextResponse.json({ success: true, post }, { status: 201 });
    }

    // Default: publish now
    const post = await postService.publishPost({
      accountId,
      text,
      mediaType,
      mediaItems,
      affiliateLinkIds,
    });
    return NextResponse.json({ success: true, post }, { status: 201 });
  } catch (err) {
    const safeError = sanitizeErrorMessage(err, "Failed to create or publish post");
    return NextResponse.json({ error: safeError }, { status: 400 });
  }
}
