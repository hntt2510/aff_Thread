import { NextRequest, NextResponse } from "next/server";
import { monetizationService } from "@/services/monetization.service";
import { sanitizeErrorMessage } from "@/lib/errors/sanitizer";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const status = searchParams.get("status") as any || "ALL";
    const search = searchParams.get("search") || undefined;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);

    const result = await monetizationService.listMonetizationPosts({
      status,
      search,
      page,
      limit,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err: unknown) {
    const safeError = sanitizeErrorMessage(err, "Failed to list monetization posts");
    return NextResponse.json({ success: false, error: safeError }, { status: 500 });
  }
}
