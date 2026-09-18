import { describe, it, expect, vi, beforeEach } from "vitest";
import { encryptToken, decryptToken } from "@/lib/crypto/tokens";
import { SettingsService, maskSecretValue, KNOWN_SETTING_KEYS } from "@/services/settings/settings.service";
import postgres from "postgres";

const databaseUrl = process.env.TEST_DATABASE_URL;
let isDbReachable = false;

if (databaseUrl) {
  try {
    const probe = postgres(databaseUrl, { max: 1, connect_timeout: 2 });
    await probe`SELECT 1`;
    await probe.end();
    isDbReachable = true;
  } catch {
    isDbReachable = false;
  }
}

describe("AES-256-GCM Secret Encryption & Masking", () => {
  it("encrypts and decrypts secret token successfully", () => {
    const rawSecret = "AIzaSyD-TEST_SECRET_KEY_123456789";
    const encrypted = encryptToken(rawSecret);

    expect(encrypted.ciphertext).toBeDefined();
    expect(encrypted.iv).toHaveLength(24); // 12 bytes = 24 hex chars
    expect(encrypted.authTag).toHaveLength(32); // 16 bytes = 32 hex chars
    expect(encrypted.ciphertext).not.toContain(rawSecret);

    const decrypted = decryptToken(encrypted);
    expect(decrypted).toBe(rawSecret);
  });

  it("fails to decrypt when ciphertext or authTag is tampered", () => {
    const rawSecret = "super_confidential_key";
    const encrypted = encryptToken(rawSecret);

    // Tamper ciphertext
    const tampered = {
      ...encrypted,
      ciphertext: encrypted.ciphertext.slice(0, -2) + "00",
    };

    expect(() => decryptToken(tampered)).toThrow();
  });

  it("masks secret values correctly for safe dashboard display", () => {
    expect(maskSecretValue("")).toBe("");
    expect(maskSecretValue("short")).toBe("••••••••");
    expect(maskSecretValue("12345678")).toBe("••••••••");
    expect(maskSecretValue("AIzaSyD123456789Wxyz")).toBe("AIza...Wxyz");
  });
});

describe("SettingsService - Core Functionality", () => {
  let service: SettingsService;

  beforeEach(() => {
    service = new SettingsService();
  });

  it("returns null for non-existent setting key", async () => {
    const val = await service.getSetting("NON_EXISTENT_KEY_999999");
    expect(val).toBeNull();
  });

  it("falls back to process.env when database is unavailable or key not in db", async () => {
    const testKey = "TEST_ENV_FALLBACK_KEY";
    process.env[testKey] = "env_secret_value_xyz";

    const val = await service.getSetting(testKey);
    expect(val).toBe("env_secret_value_xyz");

    delete process.env[testKey];
  });

  it("lists masked settings from environment variables without exposing plaintext", async () => {
    process.env.GEMINI_API_KEY = "AIzaSyD_TEST_GEMINI_KEY_ENV";

    const list = await service.listSettingsMasked();
    const geminiItem = list.find((item) => item.key === "GEMINI_API_KEY");

    expect(geminiItem).toBeDefined();
    expect(geminiItem?.hasValue).toBe(true);
    expect(geminiItem?.maskedValue).toBe("AIza..._ENV");
    expect(geminiItem?.maskedValue).not.toContain("TEST_GEMINI_KEY");

    delete process.env.GEMINI_API_KEY;
  });
});

describe.skipIf(!isDbReachable)("SettingsService - Database Persistence", () => {
  let service: SettingsService;

  beforeEach(() => {
    service = new SettingsService();
  });

  it("persists encrypted setting in database, reads it back, and deletes it", async () => {
    const testKey = "DB_TEST_KEY_ALPHA";
    const testVal = "AIzaSySecretFromDbTest999";

    // Set setting
    const setResult = await service.setSetting(testKey, testVal, "Test description");
    expect(setResult.success).toBe(true);

    // Read back
    const retrieved = await service.getSetting(testKey);
    expect(retrieved).toBe(testVal);

    // List masked
    const list = await service.listSettingsMasked();
    const found = list.find((s) => s.key === testKey);
    expect(found).toBeDefined();
    expect(found?.source).toBe("DATABASE");
    expect(found?.maskedValue).toBe("AIza...t999");

    // Delete setting
    const delResult = await service.deleteSetting(testKey);
    expect(delResult.success).toBe(true);
    expect(delResult.deleted).toBe(true);

    // Verify gone
    const afterDelete = await service.getSetting(testKey);
    expect(afterDelete).toBeNull();
  });
});
