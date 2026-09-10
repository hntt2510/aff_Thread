import { NextResponse } from "next/server";
import { shopeeSessionService } from "@/services/shopee/shopee-session.service";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await shopeeSessionService.testActiveSession();
    return NextResponse.json({
      success: result.isValid,
      status: result.status,
      error: result.error,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, error: `Failed to test session: ${message}` },
      { status: 500 }
    );
  }
}
