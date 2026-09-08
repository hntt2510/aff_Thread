import { SignJWT, jwtVerify } from "jose";
import { getEnv } from "@/lib/env";

export const SESSION_COOKIE_NAME = "aff_session";
export const SESSION_MAX_AGE_SECONDS = 86400; // 24 hours

export interface SessionPayload {
  role: "admin";
  username: string;
}

function getSecretKey(): Uint8Array {
  const env = getEnv();
  return new TextEncoder().encode(env.SESSION_SECRET);
}

/**
 * Creates a signed JWT session token with a 24-hour expiration.
 */
export async function createSessionToken(username: string): Promise<string> {
  const secret = getSecretKey();
  return new SignJWT({ role: "admin", username })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(secret);
}

/**
 * Verifies a signed session token. Returns the payload or null if invalid or expired.
 */
export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const secret = getSecretKey();
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ["HS256"],
    });

    if (payload.role !== "admin" || typeof payload.username !== "string") {
      return null;
    }

    return {
      role: "admin",
      username: payload.username,
    };
  } catch {
    return null;
  }
}

/**
 * Standard cookie configuration for the session cookie.
 */
export function getSessionCookieOptions() {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax" as const,
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  };
}
