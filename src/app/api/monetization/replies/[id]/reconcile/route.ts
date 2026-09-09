import { NextRequest, NextResponse } from "next/server";
import { replyPublisherService } from "@/services/reply-publisher.service";
import { accountService } from "@/services/account.service";
import { db } from "@/db";
import { affiliateReplies, posts } from "@/db/schema";
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
      return NextResponse.json({ success: true, reconciled: true, reply });
    }

    const [post] = await db
      .select()
      .from(posts)
      .where(eq(posts.id, reply.postId))
      .limit(1);

    if (!post || !post.threadsPostId || !post.accountId) {
      return NextResponse.json({ success: false, error: "Parent post or account not found" }, { status: 400 });
    }

    const { token } = await accountService.getDecryptedTokenForAccount(post.accountId);
    const foundId = await replyPublisherService.tryReconcilePublishedReply(token, post.threadsPostId, reply.replyText);

    if (foundId) {
      const publishedAt = new Date();
      const [updated] = await db
        .update(affiliateReplies)
        .set({
          status: "PUBLISHED",
          threadsReplyId: foundId,
          publishedAt,
          updatedAt: publishedAt,
          lastError: null,
        })
        .where(eq(affiliateReplies.id, reply.id))
        .returning();

      return NextResponse.json({ success: true, reconciled: true, reply: updated });
    }

    return NextResponse.json({
      success: true,
      reconciled: false,
      message: "No matching published reply found on Threads. Reply remains in its current state.",
    });
  } catch (err: unknown) {
    const safeError = sanitizeErrorMessage(err, "Failed to reconcile reply");
    return NextResponse.json({ success: false, error: safeError }, { status: 500 });
  }
}
