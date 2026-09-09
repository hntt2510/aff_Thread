import { NextRequest, NextResponse } from "next/server";
import { ensureDatabaseSchema, inspectDatabaseSchema } from "@/db/migrate";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const action = req.nextUrl.searchParams.get("action");

    // Read-only inspection mode
    if (action === "inspect") {
      const state = await inspectDatabaseSchema();
      return NextResponse.json({
        success: true,
        inspected: state,
      });
    }

    // Migration mode: inspect before, ensure migrations, inspect after
    const start = Date.now();
    const before = await inspectDatabaseSchema();
    await ensureDatabaseSchema();
    const after = await inspectDatabaseSchema();

    return NextResponse.json({
      success: true,
      message: "Database schema is up to date",
      durationMs: Date.now() - start,
      before,
      after,
      verified: after.allObjectsExist && after.is0003Applied && after.is0004Applied && after.is0005Applied,
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

export async function POST(req: NextRequest) {
  return GET(req);
}
