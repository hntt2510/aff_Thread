import { NextResponse } from "next/server";
import { ensureDatabaseSchema } from "@/db/migrate";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const start = Date.now();
    await ensureDatabaseSchema();
    return NextResponse.json({
      success: true,
      message: "Database schema is up to date",
      durationMs: Date.now() - start,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}

export async function POST() {
  return GET();
}
