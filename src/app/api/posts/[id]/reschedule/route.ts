import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { postService } from "@/services/post.service";
import { sanitizeErrorMessage } from "@/lib/errors/sanitizer";

export const dynamic = "force-dynamic";

const rescheduleSchema = z.object({
  scheduledAt: z.string().min(1, "Scheduled timestamp is required"),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Post ID is required" }, { status: 400 });
    }

    const body = await req.json();
    const parsed = rescheduleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid reschedule payload" },
        { status: 400 }
      );
    }

    const newDate = new Date(parsed.data.scheduledAt);
    if (isNaN(newDate.getTime())) {
      return NextResponse.json(
        { error: "Invalid scheduled date timestamp format" },
        { status: 400 }
      );
    }

    const post = await postService.reschedulePost(id, newDate);
    return NextResponse.json({ success: true, post });
  } catch (err) {
    const safeError = sanitizeErrorMessage(err, "Failed to reschedule post");
    return NextResponse.json({ error: safeError }, { status: 400 });
  }
}
