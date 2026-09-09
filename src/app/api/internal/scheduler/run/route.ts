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
  // 1. Check Bearer token in Authorization header
  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7).trim();
    if (verifyCronSecret(token)) return true;
  }

  // 2. Check x-cron-secret header
  const headerSecret = req.headers.get("x-cron-secret");
  if (headerSecret && verifyCronSecret(headerSecret)) return true;

  // 3. Check query parameter ?cron_secret=...
  const querySecret = req.nextUrl.searchParams.get("cron_secret");
  if (querySecret && verifyCronSecret(querySecret)) return true;

  // 4. Check admin session cookie
  const sessionCookie = req.cookies.get("aff_session")?.value;
  if (sessionCookie && process.env.SESSION_SECRET) {
    try {
      const secretKey = new TextEncoder().encode(process.env.SESSION_SECRET);
      const { payload } = await jwtVerify(sessionCookie, secretKey, {
        algorithms: ["HS256"],
      });
      if (payload.role === "admin") return true;
    } catch {
      return false;
    }
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
