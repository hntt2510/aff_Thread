import { NextRequest, NextResponse } from "next/server";
import { mediaStorageService } from "@/services/media-storage.service";
import { sanitizeErrorMessage } from "@/lib/errors/sanitizer";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      accountId,
      publicId,
      resourceType,
      secureUrl,
      originalFilename,
      bytes,
      width,
      height,
      format,
      durationSeconds,
    } = body;

    if (!publicId || !resourceType || !secureUrl) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: publicId, resourceType, secureUrl" },
        { status: 400 }
      );
    }

    const asset = await mediaStorageService.registerAsset({
      accountId,
      publicId,
      resourceType,
      secureUrl,
      originalFilename,
      bytes,
      width,
      height,
      format,
      durationSeconds,
    });

    return NextResponse.json({
      success: true,
      asset,
    });
  } catch (err: unknown) {
    const safeError = sanitizeErrorMessage(err, "Failed to register media asset");
    return NextResponse.json({ success: false, error: safeError }, { status: 400 });
  }
}
