import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getEnv, resetEnvCache } from "@/lib/env";

describe("Environment Validation", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    resetEnvCache();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    resetEnvCache();
  });

  it("validates when all required variables are present and correct", () => {
    process.env.ADMIN_USERNAME = "admin";
    process.env.ADMIN_PASSWORD_HASH = "salt:hash";
    process.env.SESSION_SECRET = "12345678901234567890123456789012";
    process.env.THREADS_TOKEN_ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db";

    const env = getEnv();
    expect(env.ADMIN_USERNAME).toBe("admin");
    expect(env.DATABASE_URL).toContain("postgresql://");
  });

  it("defaults ADMIN_USERNAME to 'admin' when empty string or whitespace", () => {
    process.env.ADMIN_USERNAME = "";
    process.env.ADMIN_PASSWORD_HASH = "salt:hash";
    process.env.SESSION_SECRET = "12345678901234567890123456789012";
    process.env.THREADS_TOKEN_ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db";

    const env = getEnv();
    expect(env.ADMIN_USERNAME).toBe("admin");

    resetEnvCache();
    process.env.ADMIN_USERNAME = "   ";
    const env2 = getEnv();
    expect(env2.ADMIN_USERNAME).toBe("admin");
  });

  it("trims whitespace from environment variables", () => {
    process.env.ADMIN_USERNAME = "  custom_admin  ";
    process.env.ADMIN_PASSWORD_HASH = "  salt:hash  ";
    process.env.SESSION_SECRET = "  12345678901234567890123456789012  ";
    process.env.THREADS_TOKEN_ENCRYPTION_KEY =
      "  0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef  ";
    process.env.DATABASE_URL = "  postgresql://user:pass@localhost:5432/db  ";

    const env = getEnv();
    expect(env.ADMIN_USERNAME).toBe("custom_admin");
    expect(env.ADMIN_PASSWORD_HASH).toBe("salt:hash");
    expect(env.SESSION_SECRET).toBe("12345678901234567890123456789012");
    expect(env.THREADS_TOKEN_ENCRYPTION_KEY).toBe("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef");
    expect(env.DATABASE_URL).toBe("postgresql://user:pass@localhost:5432/db");
  });

  it("throws error when SESSION_SECRET is too short (< 32 chars)", () => {
    process.env.ADMIN_USERNAME = "admin";
    process.env.ADMIN_PASSWORD_HASH = "salt:hash";
    process.env.SESSION_SECRET = "too_short";
    process.env.THREADS_TOKEN_ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    process.env.DATABASE_URL = "postgresql://localhost:5432/db";

    expect(() => getEnv()).toThrow("SESSION_SECRET must be at least 32 characters");
  });

  it("throws error when THREADS_TOKEN_ENCRYPTION_KEY is not 64 hex characters", () => {
    process.env.ADMIN_USERNAME = "admin";
    process.env.ADMIN_PASSWORD_HASH = "salt:hash";
    process.env.SESSION_SECRET = "12345678901234567890123456789012";
    process.env.THREADS_TOKEN_ENCRYPTION_KEY = "invalid_length";
    process.env.DATABASE_URL = "postgresql://localhost:5432/db";

    expect(() => getEnv()).toThrow("THREADS_TOKEN_ENCRYPTION_KEY must be a 64-character hex string");
  });

  it("throws error when THREADS_TOKEN_ENCRYPTION_KEY contains 64 characters but non-hex", () => {
    process.env.ADMIN_USERNAME = "admin";
    process.env.ADMIN_PASSWORD_HASH = "salt:hash";
    process.env.SESSION_SECRET = "12345678901234567890123456789012";
    // 64 characters long but includes non-hex characters ('z')
    process.env.THREADS_TOKEN_ENCRYPTION_KEY = "z".repeat(64);
    process.env.DATABASE_URL = "postgresql://localhost:5432/db";

    expect(() => getEnv()).toThrow("THREADS_TOKEN_ENCRYPTION_KEY must be a 64-character hex string");
  });

  it("throws error when DATABASE_URL is missing", () => {
    delete process.env.DATABASE_URL;
    process.env.ADMIN_PASSWORD_HASH = "salt:hash";
    process.env.SESSION_SECRET = "12345678901234567890123456789012";
    process.env.THREADS_TOKEN_ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    expect(() => getEnv()).toThrow("DATABASE_URL is required");
  });
});
