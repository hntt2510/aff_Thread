import { NextRequest, NextResponse } from "next/server";
import { settingsService } from "@/services/settings/settings.service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const settings = await settingsService.listSettingsMasked();
    return NextResponse.json({ success: true, settings });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Failed to list system settings:", message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { key, value, description } = body;

    if (!key || typeof key !== "string" || !key.trim()) {
      return NextResponse.json(
        { success: false, error: "Missing required 'key' string in request body." },
        { status: 400 }
      );
    }

    if (value === undefined || value === null || typeof value !== "string" || !value.trim()) {
      return NextResponse.json(
        { success: false, error: "Missing required 'value' string in request body." },
        { status: 400 }
      );
    }

    const result = await settingsService.setSetting(
      key.trim(),
      value.trim(),
      typeof description === "string" ? description.trim() : undefined
    );

    return NextResponse.json({
      success: true,
      key: result.key,
      message: `Setting '${result.key}' updated successfully.`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Failed to update system setting:", message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const key = searchParams.get("key");

    if (!key || !key.trim()) {
      return NextResponse.json(
        { success: false, error: "Missing required 'key' query parameter." },
        { status: 400 }
      );
    }

    const result = await settingsService.deleteSetting(key.trim());
    return NextResponse.json({
      success: true,
      deleted: result.deleted,
      message: result.deleted ? `Setting '${key}' deleted.` : `Setting '${key}' was not found in database.`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Failed to delete system setting:", message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
