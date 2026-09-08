import { describe, it, expect } from "vitest";
import { encryptToken, decryptToken } from "@/lib/crypto/tokens";
import crypto from "crypto";

describe("AES-256-GCM Token Encryption", () => {
  it("successfully encrypts and decrypts access token roundtrip", () => {
    const rawToken = "THQ_test_access_token_1234567890abcdefghijklmnopqrstuvwxyz";
    const encrypted = encryptToken(rawToken);

    expect(encrypted.ciphertext).toBeDefined();
    expect(encrypted.iv).toHaveLength(24); // 12 bytes = 24 hex chars
    expect(encrypted.authTag).toHaveLength(32); // 16 bytes = 32 hex chars

    const decrypted = decryptToken(encrypted);
    expect(decrypted).toBe(rawToken);
  });

  it("fails decryption when ciphertext is tampered", () => {
    const rawToken = "my_sample_token";
    const encrypted = encryptToken(rawToken);

    // Tamper ciphertext
    const tampered = {
      ...encrypted,
      ciphertext: encrypted.ciphertext.slice(0, -2) + "00",
    };

    expect(() => decryptToken(tampered)).toThrow();
  });

  it("fails decryption when authTag is tampered", () => {
    const rawToken = "my_sample_token";
    const encrypted = encryptToken(rawToken);

    // Tamper auth tag
    const tampered = {
      ...encrypted,
      authTag: encrypted.authTag.slice(0, -2) + "ff",
    };

    expect(() => decryptToken(tampered)).toThrow();
  });

  it("fails decryption when using a different key", () => {
    const rawToken = "my_sample_token";
    const key1 = crypto.randomBytes(32);
    const key2 = crypto.randomBytes(32);

    const encrypted = encryptToken(rawToken, key1);
    expect(() => decryptToken(encrypted, key2)).toThrow();
  });

  it("rejects empty token for encryption", () => {
    expect(() => encryptToken("")).toThrow("Cannot encrypt empty token");
  });

  it("rejects malformed encrypted payload", () => {
    expect(() =>
      decryptToken({ ciphertext: "", iv: "", authTag: "" })
    ).toThrow("Malformed encrypted token data");
  });
});
