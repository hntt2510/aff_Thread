import { NextResponse } from "next/server";
import { db } from "@/db";
import { threadsAccounts, posts } from "@/db/schema";
import { eq, count } from "drizzle-orm";
import { ensureDatabaseSchema } from "@/db/migrate";
import { postService } from "@/services/post.service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureDatabaseSchema();

    const [accountsResult] = await db
      .select({ count: count() })
      .from(threadsAccounts)
      .where(eq(threadsAccounts.status, "ACTIVE"));

    const [publishedResult] = await db
      .select({ count: count() })
      .from(posts)
      .where(eq(posts.status, "PUBLISHED"));

    const [scheduledResult] = await db
      .select({ count: count() })
      .from(posts)
      .where(eq(posts.status, "SCHEDULED"));

    const [failedResult] = await db
      .select({ count: count() })
      .from(posts)
      .where(eq(posts.status, "FAILED"));

    const upcomingPosts = await postService.listUpcomingScheduled(5);
    const recentActivity = await postService.listPosts({ limit: 5 });

    return NextResponse.json({
      connectedAccounts: accountsResult?.count || 0,
      publishedPosts: publishedResult?.count || 0,
      scheduledPosts: scheduledResult?.count || 0,
      failedPosts: failedResult?.count || 0,
      upcomingPosts,
      recentActivity,
    });
  } catch {
    return NextResponse.json({
      connectedAccounts: 0,
      publishedPosts: 0,
      scheduledPosts: 0,
      failedPosts: 0,
      upcomingPosts: [],
      recentActivity: [],
    });
  }
}
