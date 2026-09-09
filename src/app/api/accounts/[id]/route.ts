import { NextRequest, NextResponse } from "next/server";
import { accountService } from "@/services/account.service";
import { sanitizeErrorMessage } from "@/lib/errors/sanitizer";

export const dynamic = "force-dynamic";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await accountService.removeAccount(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    const safeError = sanitizeErrorMessage(err, "Failed to remove account");
    return NextResponse.json({ error: safeError }, { status: 400 });
  }
}
