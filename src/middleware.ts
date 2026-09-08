import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE_NAME = "aff_session";

// Public paths that do not require authentication
const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/health"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow Next.js internals, static files, images
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/static") ||
    pathname.includes(".") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const isPublic = PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(path + "/"));

  const sessionCookie = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  let isAuthenticated = false;

  if (sessionCookie) {
    try {
      const secret = process.env.SESSION_SECRET;
      if (secret) {
        const secretKey = new TextEncoder().encode(secret);
        const { payload } = await jwtVerify(sessionCookie, secretKey, {
          algorithms: ["HS256"],
        });
        if (payload.role === "admin") {
          isAuthenticated = true;
        }
      }
    } catch {
      isAuthenticated = false;
    }
  }

  // If authenticated user tries to visit /login, redirect to /dashboard
  if (isAuthenticated && pathname === "/login") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  // If public route, allow through
  if (isPublic) {
    return NextResponse.next();
  }

  // If unauthenticated:
  if (!isAuthenticated) {
    // API routes return 401 JSON
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Page routes redirect to /login
    const loginUrl = new URL("/login", req.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
