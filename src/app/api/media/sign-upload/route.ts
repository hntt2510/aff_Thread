import { NextRequest, NextResponse } from "next/server";
import { mediaStorageService } from "@/services/media-storage.service";
import { sanitizeErrorMessage } from "@/lib/errors/sanitizer";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { accountId, resourceType, filename } = body;

    if (!resourceType || (resourceType !== "image" && resourceType !== "video")) {
      return NextResponse.json(
        { success: false, error: "resourceType must be 'image' or 'video'" },
        { status: 400 }
      );
    }

    const signResult = await mediaStorageService.createUploadSignature({
      accountId,
      resourceType,
      filename,
    });

    return NextResponse.json({
      success: true,
      ...signResult,
    });
  } catch (err: unknown) {
    const safeError = sanitizeErrorMessage(err, "Failed to generate upload signature");
    return NextResponse.json({ success: false, error: safeError }, { status: 500 });
  }
}
