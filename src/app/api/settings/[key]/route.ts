import { NextRequest, NextResponse } from "next/server";
import { settingsService } from "@/services/settings/settings.service";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const { key } = await params;
    if (!key || !key.trim()) {
      return NextResponse.json(
        { success: false, error: "Missing required key parameter." },
        { status: 400 }
      );
    }

    const result = await settingsService.deleteSetting(decodeURIComponent(key.trim()));
    return NextResponse.json({
      success: true,
      deleted: result.deleted,
      message: result.deleted ? `Setting '${key}' deleted.` : `Setting '${key}' was not found in database.`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Failed to delete system setting by path parameter:", message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
