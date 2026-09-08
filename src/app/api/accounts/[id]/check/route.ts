import { NextRequest, NextResponse } from "next/server";
import { accountService } from "@/services/account.service";
import { sanitizeErrorMessage } from "@/lib/errors/sanitizer";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const account = await accountService.checkAccount(id);
    return NextResponse.json({ success: true, account });
  } catch (err) {
    const safeError = sanitizeErrorMessage(err, "Account health check failed");
    return NextResponse.json({ error: safeError }, { status: 400 });
  }
}
