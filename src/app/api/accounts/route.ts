import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { accountService } from "@/services/account.service";
import { sanitizeErrorMessage } from "@/lib/errors/sanitizer";

export const dynamic = "force-dynamic";

const addAccountSchema = z.object({
  accessToken: z.string().min(1, "Access token is required"),
});

export async function GET() {
  try {
    const accounts = await accountService.listAccounts();
    return NextResponse.json({ accounts });
  } catch (err) {
    const safeError = sanitizeErrorMessage(err, "Failed to retrieve accounts");
    return NextResponse.json({ error: safeError }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = addAccountSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Access token is required" }, { status: 400 });
    }

    const account = await accountService.addAccount(parsed.data.accessToken);
    return NextResponse.json({ success: true, account }, { status: 201 });
  } catch (err) {
    const safeError = sanitizeErrorMessage(err, "Failed to add account");
    return NextResponse.json({ error: safeError }, { status: 400 });
  }
}
