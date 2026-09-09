import { NextResponse } from "next/server";
import { db } from "@/db";
import { threadsAccounts, posts } from "@/db/schema";
import { eq, count } from "drizzle-orm";
import { ensureDatabaseSchema } from "@/db/migrate";

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

    const [failedResult] = await db
      .select({ count: count() })
      .from(posts)
      .where(eq(posts.status, "FAILED"));

    return NextResponse.json({
      connectedAccounts: accountsResult?.count || 0,
      publishedPosts: publishedResult?.count || 0,
      failedPosts: failedResult?.count || 0,
    });
  } catch {
    // If tables not yet migrated or DB unavailable during early M0 check
    return NextResponse.json({
      connectedAccounts: 0,
      publishedPosts: 0,
      failedPosts: 0,
    });
  }
}
