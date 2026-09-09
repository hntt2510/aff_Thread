import { NextRequest, NextResponse } from "next/server";
import { replyPublisherService } from "@/services/reply-publisher.service";
import { db } from "@/db";
import { affiliateReplies } from "@/db/schema";
import { eq } from "drizzle-orm";
import { sanitizeErrorMessage } from "@/lib/errors/sanitizer";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ success: false, error: "Missing reply ID" }, { status: 400 });
    }

    const [reply] = await db
      .select()
      .from(affiliateReplies)
      .where(eq(affiliateReplies.id, id))
      .limit(1);

    if (!reply) {
      return NextResponse.json({ success: false, error: "Reply not found" }, { status: 404 });
    }

    if (reply.status === "PUBLISHED") {
      return NextResponse.json({ success: true, message: "Reply is already published", threadsReplyId: reply.threadsReplyId });
    }

    const result = await replyPublisherService.processClaimedReply(reply);
    return NextResponse.json({ success: result.status === "PUBLISHED", result });
  } catch (err: unknown) {
    const safeError = sanitizeErrorMessage(err, "Failed to publish reply");
    return NextResponse.json({ success: false, error: safeError }, { status: 500 });
  }
}
