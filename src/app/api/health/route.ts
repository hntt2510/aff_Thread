import { NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { sanitizeErrorMessage } from "@/lib/errors/sanitizer";

export const dynamic = "force-dynamic";

export async function GET() {
  const timestamp = new Date().toISOString();
  let dbStatus = "unreachable";

  try {
    // Perform simple ping to check DB connectivity
    await db.execute(sql`SELECT 1`);
    dbStatus = "connected";
  } catch (err) {
    // Safe error message, do not expose credentials or internal paths
    const safeError = sanitizeErrorMessage(err, "Database connection failed");
    return NextResponse.json(
      {
        status: "degraded",
        timestamp,
        app: "alive",
        database: "unreachable",
        error: safeError,
      },
      { status: 503 }
    );
  }

  return NextResponse.json(
    {
      status: "healthy",
      timestamp,
      app: "alive",
      database: dbStatus,
    },
    { status: 200 }
  );
}
