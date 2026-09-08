import { describe, it, expect } from "vitest";
import { sanitizeString, sanitizeErrorMessage } from "@/lib/errors/sanitizer";

describe("Log & Error Sanitizer", () => {
  it("masks postgres database credentials from connection strings", () => {
    const raw = "Connection failed to postgresql://thanglong:secret_pass_123@localhost:5432/aff_thread";
    const sanitized = sanitizeString(raw);

    expect(sanitized).not.toContain("secret_pass_123");
    expect(sanitized).toContain("postgresql://thanglong:***@");
  });

  it("masks Meta access tokens", () => {
    const raw = "Graph API returned error with token EAABwzL18...and EAAB12345678901234567890";
    const sanitized = sanitizeString(raw);

    expect(sanitized).not.toContain("EAAB12345678901234567890");
    expect(sanitized).toContain("[REDACTED_META_TOKEN]");
  });

  it("masks access_token in URLs and query params", () => {
    const raw = "https://graph.threads.net/v1.0/me?access_token=THQ9876543210abcdef123456&fields=id";
    const sanitized = sanitizeString(raw);

    expect(sanitized).not.toContain("THQ9876543210abcdef123456");
    expect(sanitized).toContain("access_token=[REDACTED]");
  });

  it("masks access_token in JSON strings", () => {
    const raw = '{"error": "Invalid token", "access_token": "secret_token_value_abc"}';
    const sanitized = sanitizeString(raw);

    expect(sanitized).not.toContain("secret_token_value_abc");
    expect(sanitized).toContain('"access_token": "[REDACTED]"');
  });

  it("extracts and sanitizes Error object messages safely", () => {
    const error = new Error("Failed to connect: postgresql://admin:super_secret@remote.db:5432/db");
    const sanitized = sanitizeErrorMessage(error);

    expect(sanitized).not.toContain("super_secret");
    expect(sanitized).toContain("postgresql://admin:***@remote.db:5432/db");
  });
});
