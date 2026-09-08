import { describe, it, expect, vi } from "vitest";
import {
  sanitizeString,
  sanitizeErrorMessage,
  sanitizeValue,
  safeLogger,
} from "@/lib/errors/sanitizer";

describe("Hardened Secret & Token Sanitizer", () => {
  it("masks postgres database credentials from connection strings", () => {
    const raw = "Connection failed to postgresql://thanglong:secret_pass_123@localhost:5432/aff_thread";
    const sanitized = sanitizeString(raw);

    expect(sanitized).not.toContain("secret_pass_123");
    expect(sanitized).toContain("postgresql://thanglong:***@");
  });

  it("masks Bearer tokens in Authorization headers regardless of token prefix", () => {
    const raw = "Request failed: Authorization: Bearer THAA_custom_prefix_token_99998888";
    const sanitized = sanitizeString(raw);

    expect(sanitized).not.toContain("THAA_custom_prefix_token_99998888");
    expect(sanitized).toContain("Bearer [REDACTED]");
  });

  it("masks tokens with arbitrary unknown prefix in JSON payload", () => {
    const arbitraryToken = "UNKNOWN_PREFIX_XYZ_abcdef1234567890_token_val";
    const raw = `{"error": "invalid_grant", "access_token": "${arbitraryToken}"}`;
    const sanitized = sanitizeString(raw);

    expect(sanitized).not.toContain(arbitraryToken);
    expect(sanitized).toContain('"access_token": "[REDACTED]"');
  });

  it("masks tokens with arbitrary unknown prefix in query parameters", () => {
    const customToken = "MY_SPECIAL_TOKEN_123456789";
    const raw = `https://graph.threads.net/v1.0/me?access_token=${customToken}&fields=id`;
    const sanitized = sanitizeString(raw);

    expect(sanitized).not.toContain(customToken);
    expect(sanitized).toContain("access_token=[REDACTED]");
  });

  it("masks client_secret and password keys in strings", () => {
    const raw = "Failed with client_secret=very_secret_key_123 and password=admin_pass_999";
    const sanitized = sanitizeString(raw);

    expect(sanitized).not.toContain("very_secret_key_123");
    expect(sanitized).not.toContain("admin_pass_999");
    expect(sanitized).toContain("client_secret=[REDACTED]");
    expect(sanitized).toContain("password=[REDACTED]");
  });

  it("recursively sanitizes nested JavaScript objects and arrays via sanitizeValue", () => {
    const nestedData = {
      user: "admin",
      diagnosticCode: 404,
      auth: {
        accessToken: "THAA_secret_token_deeply_nested",
        refreshToken: "refresh_token_value_999",
      },
      tokens: ["THAA_token_1", "THAA_token_2"],
      metadata: {
        safeField: "keep this unchanged",
      },
    };

    const sanitized = sanitizeValue(nestedData) as any;

    expect(sanitized.user).toBe("admin");
    expect(sanitized.diagnosticCode).toBe(404);
    expect(sanitized.metadata.safeField).toBe("keep this unchanged");

    // Redacted sensitive keys
    expect(sanitized.auth.accessToken).toBe("[REDACTED]");
    expect(sanitized.auth.accessToken).not.toContain("THAA_secret_token_deeply_nested");
  });

  it("does not mutate normal non-sensitive diagnostic data", () => {
    const normalLog = "Account @fashion_affiliate checked at 2026-09-08T12:00:00Z with status ACTIVE";
    const sanitized = sanitizeString(normalLog);

    expect(sanitized).toBe(normalLog);
  });

  it("safeLogger does not leak token when given nested objects", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const fakeToken = "THAA_fake_token_should_never_be_logged";
    safeLogger.error("Failed to authenticate account", {
      accountId: "acc_123",
      accessToken: fakeToken,
    });

    expect(consoleSpy).toHaveBeenCalled();
    const loggedArgs = consoleSpy.mock.calls[0];
    const loggedString = JSON.stringify(loggedArgs);

    expect(loggedString).not.toContain(fakeToken);
    expect(loggedString).toContain("[REDACTED]");

    consoleSpy.mockRestore();
  });
});
