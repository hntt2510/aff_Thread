import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { affiliateService } from "@/services/affiliate.service";
import { sanitizeErrorMessage } from "@/lib/errors/sanitizer";

export const dynamic = "force-dynamic";

const campaignSchema = z.object({
  name: z.string().min(1, "Campaign name is required").max(100),
  network: z.string().max(50).optional(),
  description: z.string().max(500).optional(),
});

export async function GET() {
  try {
    const campaigns = await affiliateService.listCampaigns();
    return NextResponse.json({ campaigns });
  } catch (err) {
    const safeError = sanitizeErrorMessage(err, "Failed to retrieve campaigns");
    return NextResponse.json({ error: safeError }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = campaignSchema.safeParse(body);

    if (!parsed.success) {
      const errorMsg = parsed.error.issues[0]?.message || "Invalid campaign payload";
      return NextResponse.json({ error: errorMsg }, { status: 400 });
    }

    const campaign = await affiliateService.createCampaign(parsed.data);
    return NextResponse.json({ success: true, campaign }, { status: 201 });
  } catch (err) {
    const safeError = sanitizeErrorMessage(err, "Failed to create campaign");
    return NextResponse.json({ error: safeError }, { status: 400 });
  }
}
