import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { mediaStorageService } from "@/services/media-storage.service";
import { sanitizeErrorMessage } from "@/lib/errors/sanitizer";

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

  try {
    const olderThanParam = req.nextUrl.searchParams.get("olderThanHours");
    const olderThanHours = olderThanParam ? parseInt(olderThanParam, 10) : 24;
    const safeHours = isNaN(olderThanHours) || olderThanHours < 1 ? 24 : olderThanHours;

    const result = await mediaStorageService.cleanupOrphanedAssets(safeHours);
    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err: unknown) {
    const safeError = sanitizeErrorMessage(err, "Failed to run media cleanup");
    return NextResponse.json({ success: false, error: safeError }, { status: 500 });
  }
}
