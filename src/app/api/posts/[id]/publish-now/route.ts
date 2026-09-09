import { NextRequest, NextResponse } from "next/server";
import { postService } from "@/services/post.service";
import { sanitizeErrorMessage } from "@/lib/errors/sanitizer";
import { getDatabaseClient } from "@/db";
import { Post } from "@/db/schema";

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

    // Atomically claim the scheduled post into PUBLISHING
    const sql = getDatabaseClient();
    const [claimed] = await sql<Post[]>`
      UPDATE "posts"
      SET
        "status" = 'PUBLISHING',
        "publish_attempts" = "posts"."publish_attempts" + 1,
        "last_attempt_at" = NOW(),
        "updated_at" = NOW()
      WHERE "id" = ${id} AND "status" = 'SCHEDULED'
      RETURNING
        "id",
        "account_id" as "accountId",
        "account_threads_user_id" as "accountThreadsUserId",
        "account_username" as "accountUsername",
        "account_display_name" as "accountDisplayName",
        "text",
        "container_id" as "containerId",
        "threads_post_id" as "threadsPostId",
        "status",
        "error_code" as "errorCode",
        "error_message" as "errorMessage",
        "scheduled_at" as "scheduledAt",
        "failed_at" as "failedAt",
        "cancelled_at" as "cancelledAt",
        "publish_attempts" as "publishAttempts",
        "last_attempt_at" as "lastAttemptAt",
        "last_error" as "lastError",
        "created_at" as "createdAt",
        "published_at" as "publishedAt",
        "updated_at" as "updatedAt";
    `;

    if (!claimed) {
      return NextResponse.json(
        { error: "Post is not in SCHEDULED state or is already being processed" },
        { status: 400 }
      );
    }

    const post = await postService.processClaimedPost(claimed);
    return NextResponse.json({ success: true, post });
  } catch (err) {
    const safeError = sanitizeErrorMessage(err, "Failed to publish scheduled post now");
    return NextResponse.json({ error: safeError }, { status: 400 });
  }
}
