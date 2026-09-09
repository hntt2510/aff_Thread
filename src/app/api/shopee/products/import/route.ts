import { NextRequest, NextResponse } from "next/server";
import { csvProductCatalogProvider } from "@/services/shopee/providers/csv-provider";
import { sanitizeErrorMessage } from "@/lib/errors/sanitizer";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body.action || "PREVIEW"; // "PREVIEW" | "CONFIRM"
    const csvContent = body.csvContent;

    if (!csvContent || typeof csvContent !== "string") {
      return NextResponse.json(
        { success: false, error: "Missing csvContent string in request body" },
        { status: 400 }
      );
    }

    // Step 1: Validate CSV
    const preview = csvProductCatalogProvider.validateCsv(csvContent);

    if (action === "PREVIEW") {
      return NextResponse.json({
        success: true,
        action: "PREVIEW",
        preview: {
          validCount: preview.validCount,
          warningsCount: preview.warningsCount,
          rejectedCount: preview.rejectedCount,
          duplicateCount: preview.duplicateCount,
          sampleValidRows: preview.validRows.slice(0, 5),
          warnings: preview.warnings.slice(0, 10),
          rejections: preview.rejections.slice(0, 10),
        },
      });
    }

    // Step 2: Confirm Persistence
    if (preview.validCount === 0) {
      return NextResponse.json(
        { success: false, error: "Cannot confirm import: No valid product rows found." },
        { status: 400 }
      );
    }

    const persistResult = await csvProductCatalogProvider.persistImport(preview.validRows);

    return NextResponse.json({
      success: true,
      action: "CONFIRM",
      result: persistResult,
      summary: {
        totalProcessed: preview.validCount,
        warningsCount: preview.warningsCount,
        rejectedCount: preview.rejectedCount,
      },
    });
  } catch (err: unknown) {
    const safe = sanitizeErrorMessage(err, "Failed to process CSV import");
    return NextResponse.json({ success: false, error: safe }, { status: 400 });
  }
}
