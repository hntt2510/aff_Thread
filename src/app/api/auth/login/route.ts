import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { verifyPassword } from "@/lib/auth/password";
import { createSessionToken, getSessionCookieOptions, SESSION_COOKIE_NAME } from "@/lib/auth/session";

const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Username and password are required" },
        { status: 400 }
      );
    }

    const { username, password } = parsed.data;
    const env = getEnv();

    // Constant-time / secure credential comparison
    const isUsernameMatch = username === env.ADMIN_USERNAME;
    const isPasswordMatch = verifyPassword(password, env.ADMIN_PASSWORD_HASH);

    if (!isUsernameMatch || !isPasswordMatch) {
      return NextResponse.json(
        { error: "Invalid username or password" },
        { status: 401 }
      );
    }

    // Create 24h signed session
    const token = await createSessionToken(username);

    const response = NextResponse.json(
      { success: true, redirect: "/dashboard" },
      { status: 200 }
    );

    // Set HttpOnly 24-hour cookie
    response.cookies.set(SESSION_COOKIE_NAME, token, getSessionCookieOptions());

    return response;
  } catch (err) {
    console.error("[Auth Login Error]", err);
    return NextResponse.json(
      { error: "An error occurred during authentication" },
      { status: 500 }
    );
  }
}
