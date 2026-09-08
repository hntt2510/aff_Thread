import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { accountService } from "@/services/account.service";
import { sanitizeErrorMessage } from "@/lib/errors/sanitizer";

const verifySchema = z.object({
  accessToken: z.string().min(1, "Access token is required"),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = verifySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Access token is required" }, { status: 400 });
    }

    const preview = await accountService.verifyToken(parsed.data.accessToken);
    return NextResponse.json({ success: true, profile: preview });
  } catch (err) {
    const safeError = sanitizeErrorMessage(err, "Failed to verify account token");
    return NextResponse.json({ error: safeError }, { status: 400 });
  }
}
