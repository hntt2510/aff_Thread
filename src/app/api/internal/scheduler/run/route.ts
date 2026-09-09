import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { schedulerService } from "@/services/scheduler.service";
import { jwtVerify } from "jose";

export const dynamic = "force-dynamic";

function verifyCronSecret(provided: string | null): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected || !provided) return false;

  const bufProvided = Buffer.from(provided);
  const bufExpected = Buffer.from(expected);

  if (bufProvided.length !== bufExpected.length) return false;
  return crypto.timingSafeEqual(bufProvided, bufExpected);
}

async function isAuthorized(req: NextRequest): Promise<boolean> {
  // Canonical authentication mechanism: Authorization Bearer <CRON_SECRET>
  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7).trim();
    if (verifyCronSecret(token)) return true;
  }

  return false;
}

export async function POST(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const batchParam = req.nextUrl.searchParams.get("batch");
  const batchSize = batchParam ? parseInt(batchParam, 10) : 10;
  const safeBatch = isNaN(batchSize) || batchSize <= 0 ? 10 : Math.min(batchSize, 50);

  const result = await schedulerService.run(safeBatch);
  return NextResponse.json(result);
}

export async function GET(req: NextRequest) {
  return POST(req);
}
