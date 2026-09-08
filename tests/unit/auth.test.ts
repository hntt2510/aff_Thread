import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  createSessionToken,
  verifySessionToken,
  getSessionCookieOptions,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth/session";
import { SignJWT } from "jose";

describe("Password Hashing and Verification", () => {
  it("generates a valid scrypt salt:hash string", () => {
    const rawPassword = "my_secure_admin_password";
    const hash = hashPassword(rawPassword);

    expect(hash).toContain(":");
    const parts = hash.split(":");
    expect(parts).toHaveLength(2);
    expect(parts[0]).toHaveLength(32); // 16 bytes hex = 32 chars
    expect(parts[1]).toHaveLength(128); // 64 bytes hex = 128 chars
  });

  it("verifies correct password against hash", () => {
    const password = "super_admin_secret_pass";
    const hash = hashPassword(password);

    expect(verifyPassword(password, hash)).toBe(true);
  });

  it("rejects incorrect password", () => {
    const password = "correct_password";
    const hash = hashPassword(password);

    expect(verifyPassword("wrong_password", hash)).toBe(false);
  });

  it("rejects empty or malformed hash inputs", () => {
    expect(verifyPassword("", "salt:hash")).toBe(false);
    expect(verifyPassword("pass", "")).toBe(false);
    expect(verifyPassword("pass", "malformed_no_colon")).toBe(false);
  });
});

describe("Admin Session Management", () => {
  it("creates and verifies a signed 24-hour session token", async () => {
    const username = "admin";
    const token = await createSessionToken(username);

    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(3); // standard JWT

    const payload = await verifySessionToken(token);
    expect(payload).not.toBeNull();
    expect(payload?.role).toBe("admin");
    expect(payload?.username).toBe("admin");
  });

  it("rejects tampered session tokens", async () => {
    const token = await createSessionToken("admin");
    const tampered = token.slice(0, -5) + "abcde";

    const payload = await verifySessionToken(tampered);
    expect(payload).toBeNull();
  });

  it("rejects tokens signed with wrong secret", async () => {
    const wrongSecret = new TextEncoder().encode("completely_different_secret_key_12345678");
    const fakeToken = await new SignJWT({ role: "admin", username: "admin" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("24h")
      .sign(wrongSecret);

    const payload = await verifySessionToken(fakeToken);
    expect(payload).toBeNull();
  });

  it("rejects tokens with non-admin role", async () => {
    const secret = new TextEncoder().encode(process.env.SESSION_SECRET!);
    const userToken = await new SignJWT({ role: "user", username: "someuser" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("24h")
      .sign(secret);

    const payload = await verifySessionToken(userToken);
    expect(payload).toBeNull();
  });

  it("enforces 24-hour cookie security options", () => {
    const options = getSessionCookieOptions();

    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe("lax");
    expect(options.maxAge).toBe(SESSION_MAX_AGE_SECONDS);
    expect(options.maxAge).toBe(86400);
    expect(options.path).toBe("/");
  });
});
