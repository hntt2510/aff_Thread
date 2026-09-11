import { NextRequest, NextResponse } from "next/server";
import { shopeeSessionService } from "@/services/shopee/shopee-session.service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await shopeeSessionService.getSessionStatus();
    return NextResponse.json({ success: true, session });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("Could not retrieve Shopee session status:", message);
    return NextResponse.json({
      success: true,
      session: {
        isConfigured: false,
        status: "NO_SESSION",
        username: null,
        affiliateId: null,
        lastValidatedAt: null,
        updatedAt: null,
        lastError: message,
      },
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const cookiePayload = body.cookiePayload || body.cookies || body.cookieText;

    if (!cookiePayload || typeof cookiePayload !== "string" || !cookiePayload.trim()) {
      return NextResponse.json(
        { success: false, error: "Missing required 'cookiePayload' string in request body." },
        { status: 400 }
      );
    }

    const result = await shopeeSessionService.saveSession(cookiePayload);

    if (!result.success && result.status === "INVALID") {
      return NextResponse.json(
        {
          success: false,
          status: result.status,
          error: result.error,
          detectedKeys: result.detectedKeys,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: result.success,
      status: result.status,
      message:
        result.status === "ACTIVE"
          ? "Shopee session saved and verified successfully."
          : `Shopee session saved with status: ${result.status}`,
      error: result.error,
      detectedKeys: result.detectedKeys,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, error: `Failed to save session: ${message}` },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    await shopeeSessionService.deleteSession();
    return NextResponse.json({ success: true, message: "Shopee session disconnected successfully." });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, error: `Failed to delete session: ${message}` },
      { status: 500 }
    );
  }
}
