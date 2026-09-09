import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { postMonetizationState, affiliateReplies, monetizationRuns } from "@/db/schema";
import { eq, count, desc } from "drizzle-orm";
import { sanitizeErrorMessage } from "@/lib/errors/sanitizer";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  try {
    const allStates = await db.select({ status: postMonetizationState.status }).from(postMonetizationState);
    const allReplies = await db.select({ status: affiliateReplies.status }).from(affiliateReplies);

    const counts = {
      watching: allStates.filter((s) => s.status === "WATCHING").length,
      eligible: allStates.filter((s) => s.status === "ELIGIBLE").length,
      planned: allStates.filter((s) => s.status === "PLANNED").length,
      monetized: allStates.filter((s) => s.status === "MONETIZED").length,
      repliesReady: allReplies.filter((r) => r.status === "READY").length,
      repliesPublished: allReplies.filter((r) => r.status === "PUBLISHED").length,
      repliesAmbiguous: allReplies.filter((r) => r.status === "AMBIGUOUS").length,
      repliesFailed: allReplies.filter((r) => r.status === "FAILED").length,
    };

    const recentRuns = await db
      .select()
      .from(monetizationRuns)
      .orderBy(desc(monetizationRuns.startedAt))
      .limit(5);

    return NextResponse.json({
      success: true,
      counts,
      recentRuns,
    });
  } catch (err: unknown) {
    const safeError = sanitizeErrorMessage(err, "Failed to load monetization stats");
    return NextResponse.json({ success: false, error: safeError }, { status: 500 });
  }
}
