import { NextRequest, NextResponse } from "next/server";
import { mediaStorageService } from "@/services/media-storage.service";
import { sanitizeErrorMessage } from "@/lib/errors/sanitizer";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ success: false, error: "Missing asset ID" }, { status: 400 });
    }

    const asset = await mediaStorageService.getMediaAssetById(id);
    if (!asset) {
      return NextResponse.json({ success: false, error: "Media asset not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, asset });
  } catch (err: unknown) {
    const safeError = sanitizeErrorMessage(err, "Failed to fetch media asset");
    return NextResponse.json({ success: false, error: safeError }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ success: false, error: "Missing asset ID" }, { status: 400 });
    }

    const result = await mediaStorageService.deleteMediaAsset(id);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    // If referenced by posts, return 409 Conflict
    if (message.includes("referenced by")) {
      return NextResponse.json({ success: false, error: message }, { status: 409 });
    }

    if (message.includes("not found")) {
      return NextResponse.json({ success: false, error: message }, { status: 404 });
    }

    const safeError = sanitizeErrorMessage(err, "Failed to delete media asset");
    return NextResponse.json({ success: false, error: safeError }, { status: 500 });
  }
}
