import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { shopeeIngestionService } from "@/services/shopee/shopee-ingestion.service";
import { ZodError } from "zod";

export const dynamic = "force-dynamic";

function verifyWorkerSecret(provided: string | null): boolean {
  const expected = process.env.SHOPEE_WORKER_SECRET;
  if (!expected || !provided) return false;

  const bufProvided = Buffer.from(provided);
  const bufExpected = Buffer.from(expected);

  if (bufProvided.length !== bufExpected.length) return false;
  return crypto.timingSafeEqual(bufProvided, bufExpected);
}

function isAuthorized(req: NextRequest): boolean {
  // Unconditionally reject secrets transmitted via query parameters
  const query = req.nextUrl.searchParams;
  if (
    query.has("secret") ||
    query.has("worker_secret") ||
    query.has("shopee_worker_secret") ||
    query.has("token")
  ) {
    return false;
  }

  // Canonical authentication: Authorization: Bearer <SHOPEE_WORKER_SECRET>
  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7).trim();
    if (verifyWorkerSecret(token)) return true;
  }

  return false;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      { success: false, error: "Unauthorized: Invalid or missing worker secret" },
      { status: 401 }
    );
  }

  try {
    const body = await req.json();
    const result = await shopeeIngestionService.ingestBatch(body);

    return NextResponse.json({
      success: result.success,
      batchId: result.batchId,
      alreadyIngested: result.alreadyIngested,
      seenCount: result.seenCount,
      validCount: result.validCount,
      importedCount: result.importedCount,
      rejectedCount: result.rejectedCount,
      warningsCount: result.warningsCount,
      warnings: result.warnings,
      rejections: result.rejections,
      poolCount: result.poolCount,
      runId: result.runId,
    });
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation failed for ingestion payload",
          details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
        { status: 400 }
      );
    }

    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        success: false,
        error: `Catalog ingestion failed: ${message}`,
      },
      { status: 500 }
    );
  }
}
