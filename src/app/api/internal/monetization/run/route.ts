import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { monetizationRunnerService } from "@/services/monetization-runner.service";

export const dynamic = "force-dynamic";

function verifyCronSecret(provided: string | null): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected || !provided) return false;

  const bufProvided = Buffer.from(provided);
  const bufExpected = Buffer.from(expected);

  if (bufProvided.length !== bufExpected.length) return false;
  return crypto.timingSafeEqual(bufProvided, bufExpected);
}

function isAuthorized(req: NextRequest): boolean {
  // Reject secrets in URL/query parameter unconditionally
  if (req.nextUrl.searchParams.has("cron_secret") || req.nextUrl.searchParams.has("secret")) {
    return false;
  }

  // Canonical authentication mechanism: Authorization Bearer <CRON_SECRET>
  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7).trim();
    if (verifyCronSecret(token)) return true;
  }

  return false;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const triggerSource = req.headers.get("x-monetization-source") || "cron-job-org";
  const result = await monetizationRunnerService.run({ triggerSource });

  return NextResponse.json({
    success: result.ok,
    collected: result.collected,
    evaluated: result.evaluated,
    eligible: result.eligible,
    repliesClaimed: result.repliesClaimed,
    repliesPublished: result.repliesPublished,
    repliesDeferred: result.repliesDeferred,
    repliesFailed: result.repliesFailed,
    ambiguous: result.ambiguous,
    durationMs: result.durationMs,
    errors: result.errors,
  });
}
