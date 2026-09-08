import { describe, it, expect } from "vitest";
import { middleware } from "@/middleware";
import { NextRequest } from "next/server";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";

describe("Middleware Route Protection & Dot-Path Bypass Prevention", () => {
  it("rejects unauthenticated requests to dot-containing API paths (/api/example.json) with 401", async () => {
    const req = new NextRequest("http://localhost:3000/api/example.json", {
      method: "GET",
    });

    const res = await middleware(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("redirects unauthenticated requests to dot-containing page paths (/accounts/test.foo) to /login", async () => {
    const req = new NextRequest("http://localhost:3000/accounts/test.foo", {
      method: "GET",
    });

    const res = await middleware(req);
    expect(res.status).toBe(307); // Next.js redirect status
    expect(res.headers.get("location")).toBe("http://localhost:3000/login");
  });

  it("redirects unauthenticated requests to /dashboard.html to /login", async () => {
    const req = new NextRequest("http://localhost:3000/dashboard.html", {
      method: "GET",
    });

    const res = await middleware(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/login");
  });

  it("allows public route /api/health through without authentication", async () => {
    const req = new NextRequest("http://localhost:3000/api/health", {
      method: "GET",
    });

    const res = await middleware(req);
    // NextResponse.next() returns a response with status 200 and x-middleware-next
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("allows public route /login through without authentication", async () => {
    const req = new NextRequest("http://localhost:3000/login", {
      method: "GET",
    });

    const res = await middleware(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("allows framework asset /_next/static/chunks/main.js through without authentication", async () => {
    const req = new NextRequest("http://localhost:3000/_next/static/chunks/main.js", {
      method: "GET",
    });

    const res = await middleware(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("allows authenticated user access to protected routes", async () => {
    const validToken = await createSessionToken("admin");
    const req = new NextRequest("http://localhost:3000/dashboard", {
      method: "GET",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${validToken}`,
      },
    });

    const res = await middleware(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("redirects authenticated user away from /login to /dashboard", async () => {
    const validToken = await createSessionToken("admin");
    const req = new NextRequest("http://localhost:3000/login", {
      method: "GET",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${validToken}`,
      },
    });

    const res = await middleware(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/dashboard");
  });
});
