import { NextRequest, NextResponse } from "next/server";
import { shopeeDealService } from "@/services/shopee/shopee-deal.service";
import { sanitizeErrorMessage } from "@/lib/errors/sanitizer";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const productId = searchParams.get("productId") || undefined;
    const limit = parseInt(searchParams.get("limit") || "30", 10);

    const observations = await shopeeDealService.listObservations({
      productId,
      limit,
    });

    return NextResponse.json({ success: true, observations });
  } catch (err: unknown) {
    const safe = sanitizeErrorMessage(err, "Failed to list deal observations");
    return NextResponse.json({ success: false, error: safe }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body.productId || body.observedPrice === undefined) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: productId, observedPrice" },
        { status: 400 }
      );
    }

    const result = await shopeeDealService.recordObservation({
      productId: body.productId,
      offerId: body.offerId,
      observedPrice: parseInt(body.observedPrice, 10),
      originalPrice: body.originalPrice ? parseInt(body.originalPrice, 10) : undefined,
      currency: body.currency || "VND",
      voucherCode: body.voucherCode,
      voucherType: body.voucherType,
      voucherDiscountType: body.voucherDiscountType,
      voucherDiscountPercent: body.voucherDiscountPercent ? parseFloat(body.voucherDiscountPercent) : undefined,
      voucherDiscountAmount: body.voucherDiscountAmount ? parseInt(body.voucherDiscountAmount, 10) : undefined,
      voucherMaxDiscount: body.voucherMaxDiscount ? parseInt(body.voucherMaxDiscount, 10) : undefined,
      voucherMinSpend: body.voucherMinSpend ? parseInt(body.voucherMinSpend, 10) : undefined,
      voucherValidFrom: body.voucherValidFrom,
      voucherValidUntil: body.voucherValidUntil,
      flashSale: Boolean(body.flashSale),
      freeShipping: Boolean(body.freeShipping),
      availabilityStatus: body.availabilityStatus,
      source: body.source || "MANUAL",
    });

    return NextResponse.json({ success: true, ...result }, { status: 201 });
  } catch (err: unknown) {
    const safe = sanitizeErrorMessage(err, "Failed to record deal observation");
    return NextResponse.json({ success: false, error: safe }, { status: 400 });
  }
}
