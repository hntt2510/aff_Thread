import { NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const timestamp = new Date().toISOString();

  try {
    // Perform simple ping to check DB connectivity
    await db.execute(sql`SELECT 1`);
    return NextResponse.json(
      {
        status: "healthy",
        timestamp,
        app: "alive",
        database: "connected",
      },
      { status: 200 }
    );
  } catch {
    // Log server-side only — never expose DB errors to anonymous clients
    // (connection string, hostname, credentials must not leak)
    return NextResponse.json(
      {
        status: "degraded",
        app: "alive",
        database: "unreachable",
      },
      { status: 503 }
    );
  }
}
