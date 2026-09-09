import { NextRequest, NextResponse } from "next/server";
import { shopeeDealService } from "@/services/shopee/shopee-deal.service";
import { sanitizeErrorMessage } from "@/lib/errors/sanitizer";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.observedPrice === undefined || body.observedPrice === null) {
      return NextResponse.json(
        { success: false, error: "Missing required field: observedPrice" },
        { status: 400 }
      );
    }

    const observedPrice = Math.round(Number(body.observedPrice));
    if (isNaN(observedPrice) || observedPrice <= 0) {
      return NextResponse.json(
        { success: false, error: "observedPrice must be a positive integer" },
        { status: 400 }
      );
    }

    const result = shopeeDealService.calculateDeal({
      observedPrice,
      originalPrice: body.originalPrice !== undefined && body.originalPrice !== null ? Math.round(Number(body.originalPrice)) : undefined,
      voucherDiscountType: body.voucherDiscountType || undefined,
      voucherDiscountPercent: body.voucherDiscountPercent !== undefined && body.voucherDiscountPercent !== null ? parseFloat(body.voucherDiscountPercent) : undefined,
      voucherDiscountAmount: body.voucherDiscountAmount !== undefined && body.voucherDiscountAmount !== null ? Math.round(Number(body.voucherDiscountAmount)) : undefined,
      voucherMaxDiscount: body.voucherMaxDiscount !== undefined && body.voucherMaxDiscount !== null ? Math.round(Number(body.voucherMaxDiscount)) : undefined,
      voucherMinSpend: body.voucherMinSpend !== undefined && body.voucherMinSpend !== null ? Math.round(Number(body.voucherMinSpend)) : undefined,
      voucherValidFrom: body.voucherValidFrom || undefined,
      voucherValidUntil: body.voucherValidUntil || undefined,
      voucherCode: body.voucherCode || undefined,
      voucherType: body.voucherType || undefined,
      userEligibility: body.userEligibility || undefined,
      flashSale: Boolean(body.flashSale),
      freeShipping: Boolean(body.freeShipping),
      commissionRate: body.commissionRate !== undefined && body.commissionRate !== null ? parseFloat(body.commissionRate) : undefined,
      evaluationTime: body.evaluationTime || undefined,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err: unknown) {
    const safe = sanitizeErrorMessage(err, "Failed to calculate deal preview");
    return NextResponse.json({ success: false, error: safe }, { status: 400 });
  }
}
