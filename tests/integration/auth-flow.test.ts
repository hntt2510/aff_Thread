import { describe, it, expect, beforeAll } from "vitest";
import { POST as loginHandler } from "@/app/api/auth/login/route";
import { POST as logoutHandler } from "@/app/api/auth/logout/route";
import { GET as meHandler } from "@/app/api/auth/me/route";
import { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";

describe("Authentication Integration Flow", () => {
  const validUsername = "admin";
  const validPassword = "Anhlaso1@";

  it("rejects login with wrong username", async () => {
    const req = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: "wrong_user", password: validPassword }),
    });

    const res = await loginHandler(req);
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.error).toBe("Invalid username or password");
    expect(res.cookies.get(SESSION_COOKIE_NAME)).toBeUndefined();
  });

  it("rejects login with wrong password", async () => {
    const req = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: validUsername, password: "wrong_password" }),
    });

    const res = await loginHandler(req);
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.error).toBe("Invalid username or password");
    expect(res.cookies.get(SESSION_COOKIE_NAME)).toBeUndefined();
  });

  it("successfully logs in with valid credentials and sets 24h HttpOnly cookie", async () => {
    const req = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: validUsername, password: validPassword }),
    });

    const res = await loginHandler(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.redirect).toBe("/dashboard");

    const cookie = res.cookies.get(SESSION_COOKIE_NAME);
    expect(cookie).toBeDefined();
    expect(cookie?.httpOnly).toBe(true);
    expect(String(cookie?.sameSite).toLowerCase()).toBe("lax");
    expect(cookie?.maxAge).toBe(86400);

    // Verify token payload
    const token = cookie?.value!;
    const payload = await verifySessionToken(token);
    expect(payload?.role).toBe("admin");
    expect(payload?.username).toBe("admin");
  });

  it("returns 401 when requesting /api/auth/me without session cookie", async () => {
    const req = new NextRequest("http://localhost:3000/api/auth/me", {
      method: "GET",
    });

    const res = await meHandler(req);
    expect(res.status).toBe(401);
  });

  it("returns 200 when requesting /api/auth/me with valid session cookie", async () => {
    // First login
    const loginReq = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: validUsername, password: validPassword }),
    });
    const loginRes = await loginHandler(loginReq);
    const sessionToken = loginRes.cookies.get(SESSION_COOKIE_NAME)?.value!;

    // Request me with cookie
    const meReq = new NextRequest("http://localhost:3000/api/auth/me", {
      method: "GET",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${sessionToken}`,
      },
    });

    const meRes = await meHandler(meReq);
    expect(meRes.status).toBe(200);
    const meBody = await meRes.json();
    expect(meBody.authenticated).toBe(true);
    expect(meBody.role).toBe("admin");
    expect(meBody.username).toBe("admin");
  });

  it("clears session cookie on logout", async () => {
    const res = await logoutHandler();
    expect(res.status).toBe(200);

    const cookie = res.cookies.get(SESSION_COOKIE_NAME);
    expect(cookie?.value).toBe("");
    expect(cookie?.maxAge).toBe(0);
  });
});
