import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { accountService } from "@/services/account.service";
import { sanitizeErrorMessage } from "@/lib/errors/sanitizer";

const replaceSchema = z.object({
  accessToken: z.string().min(1, "Access token is required"),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = replaceSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Access token is required" }, { status: 400 });
    }

    const account = await accountService.replaceToken(id, parsed.data.accessToken);
    return NextResponse.json({ success: true, account });
  } catch (err) {
    const safeError = sanitizeErrorMessage(err, "Token replacement failed");
    return NextResponse.json({ error: safeError }, { status: 400 });
  }
}
