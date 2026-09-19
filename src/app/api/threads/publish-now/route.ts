import { NextRequest, NextResponse } from "next/server";
import { threadsPublisherService } from "@/services/threads/threads-publisher.service";
import { sanitizeErrorMessage } from "@/lib/errors/sanitizer";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      postId,
      accountId,
      mainPostText,
      firstReplyText,
      directAffiliateUrl,
      skipDelay,
      immediateReply,
      delayReplyMinutes,
      manualReplyOnly,
      triggerMode,
      targetViews,
      targetReplies,
      maxWaitHours,
    } = body;

    // Mode 1: Publish an existing saved post by postId
    if (postId && typeof postId === "string") {
      if (immediateReply) {
        const result = await threadsPublisherService.publishPostWithReply(postId.trim(), {
          skipDelay: Boolean(skipDelay),
        });
        return NextResponse.json(result);
      }

      const result = await threadsPublisherService.publishBaitPost(postId.trim(), {
        delayReplyMinutes: delayReplyMinutes ? Number(delayReplyMinutes) : undefined,
        manualReplyOnly: manualReplyOnly !== undefined ? Boolean(manualReplyOnly) : undefined,
        triggerMode: triggerMode as "DELAY" | "MANUAL" | "ON_METRIC_REACHED" | undefined,
        targetViews: targetViews !== undefined ? Number(targetViews) : undefined,
        targetReplies: targetReplies !== undefined ? Number(targetReplies) : undefined,
        maxWaitHours: maxWaitHours !== undefined ? Number(maxWaitHours) : undefined,
      });
      return NextResponse.json(result);
    }

    // Mode 2: Direct publication from Composer with raw text and account
    if (accountId && mainPostText) {
      if (immediateReply) {
        const result = await threadsPublisherService.publishDirectly({
          accountId: accountId.trim(),
          mainPostText: String(mainPostText).trim(),
          firstReplyText: typeof firstReplyText === "string" ? firstReplyText.trim() : undefined,
          directAffiliateUrl: typeof directAffiliateUrl === "string" ? directAffiliateUrl.trim() : undefined,
          skipDelay: Boolean(skipDelay),
        });
        return NextResponse.json(result);
      }

      const result = await threadsPublisherService.publishDirectBait({
        accountId: accountId.trim(),
        mainPostText: String(mainPostText).trim(),
        firstReplyText: typeof firstReplyText === "string" ? firstReplyText.trim() : undefined,
        directAffiliateUrl: typeof directAffiliateUrl === "string" ? directAffiliateUrl.trim() : undefined,
        delayReplyMinutes: delayReplyMinutes ? Number(delayReplyMinutes) : undefined,
        manualReplyOnly: manualReplyOnly !== undefined ? Boolean(manualReplyOnly) : undefined,
        triggerMode: triggerMode as "DELAY" | "MANUAL" | "ON_METRIC_REACHED" | undefined,
        targetViews: targetViews !== undefined ? Number(targetViews) : undefined,
        targetReplies: targetReplies !== undefined ? Number(targetReplies) : undefined,
        maxWaitHours: maxWaitHours !== undefined ? Number(maxWaitHours) : undefined,
      });
      return NextResponse.json(result);
    }

    return NextResponse.json(
      { success: false, error: "Missing required 'postId' or ('accountId' and 'mainPostText') in request body." },
      { status: 400 }
    );
  } catch (err: unknown) {
    const safeError = sanitizeErrorMessage(err, "Failed to publish post to Threads");
    console.error("Error in publish-now API:", safeError);
    return NextResponse.json(
      { success: false, error: safeError },
      { status: 400 }
    );
  }
}
