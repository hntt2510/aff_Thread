import { NextRequest, NextResponse } from "next/server";
import { mediaStorageService } from "@/services/media-storage.service";
import { sanitizeErrorMessage } from "@/lib/errors/sanitizer";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "24", 10);
    const resourceType = searchParams.get("resourceType") as "image" | "video" | "all" | null;
    const search = searchParams.get("search") || undefined;

    const result = await mediaStorageService.listMediaAssets({
      page,
      limit,
      resourceType: resourceType || "all",
      search,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err: unknown) {
    const safeError = sanitizeErrorMessage(err, "Failed to list media assets");
    return NextResponse.json({ success: false, error: safeError }, { status: 500 });
  }
}
