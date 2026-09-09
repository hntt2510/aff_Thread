import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { affiliateService } from "@/services/affiliate.service";
import { sanitizeErrorMessage } from "@/lib/errors/sanitizer";

export const dynamic = "force-dynamic";

const linkSchema = z.object({
  destinationUrl: z.string().min(1, "Destination URL is required"),
  label: z.string().max(100).optional(),
  campaignId: z.string().optional(),
  network: z.string().max(50).optional(),
  subId: z.string().max(100).optional(),
  publicSlug: z.string().max(64).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const campaignId = searchParams.get("campaignId") || undefined;

    const links = await affiliateService.listLinks(campaignId);
    return NextResponse.json({ links });
  } catch (err) {
    const safeError = sanitizeErrorMessage(err, "Failed to retrieve affiliate links");
    return NextResponse.json({ error: safeError }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = linkSchema.safeParse(body);

    if (!parsed.success) {
      const errorMsg = parsed.error.issues[0]?.message || "Invalid link payload";
      return NextResponse.json({ error: errorMsg }, { status: 400 });
    }

    const link = await affiliateService.createLink(parsed.data);
    return NextResponse.json({ success: true, link }, { status: 201 });
  } catch (err) {
    const safeError = sanitizeErrorMessage(err, "Failed to create affiliate link");
    return NextResponse.json({ error: safeError }, { status: 400 });
  }
}
