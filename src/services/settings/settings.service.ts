import { db } from "@/db";
import { systemSettings } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { ensureDatabaseSchema } from "@/db/migrate";
import { encryptToken, decryptToken } from "@/lib/crypto/tokens";

export interface MaskedSetting {
  key: string;
  maskedValue: string;
  hasValue: boolean;
  source: "DATABASE" | "ENVIRONMENT";
  description: string | null;
  updatedAt: string | null;
}

export const KNOWN_SETTING_KEYS = [
  { key: "GEMINI_API_KEY", description: "Google Gemini API Key for AI text thread generation" },
  { key: "GEMINI_MODEL", description: "Gemini Model Name (e.g. gemini-2.5-flash, gemini-1.5-flash)" },
  { key: "GEMINI_CUSTOM_URL", description: "Custom Gemini Web App or Gem URL (default: https://gemini.google.com/app)" },
  { key: "OPENAI_API_KEY", description: "OpenAI API Key (optional)" },
  { key: "TIKW_API_KEY", description: "TikW-API Key for TikTok trending discovery" },
] as const;

let isSchemaEnsured = false;

async function runWithAutoMigration<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (err: unknown) {
    const errorStr = err instanceof Error ? `${err.message} ${(err as any).cause || ""}` : String(err);
    if (
      !isSchemaEnsured &&
      !errorStr.includes("ECONNREFUSED") &&
      !errorStr.includes("ETIMEDOUT") &&
      (errorStr.includes("system_settings") ||
        errorStr.includes("does not exist") ||
        errorStr.includes("42P01"))
    ) {
      try {
        await ensureDatabaseSchema();
        isSchemaEnsured = true;
        return await action();
      } catch (migErr) {
        console.error("Auto-migration execution failed for system_settings:", migErr);
      }
    }
    throw err;
  }
}

export function maskSecretValue(val: string): string {
  if (!val) return "";
  const trimmed = val.trim();
  if (trimmed.length <= 8) {
    return "••••••••";
  }
  const prefix = trimmed.slice(0, 4);
  const suffix = trimmed.slice(-4);
  return `${prefix}...${suffix}`;
}

export class SettingsService {
  /**
   * Retrieves a decrypted setting by key.
   * Priority: Database -> process.env fallback.
   */
  async getSetting(key: string): Promise<string | null> {
    try {
      const records = await runWithAutoMigration(async () => {
        return await db
          .select()
          .from(systemSettings)
          .where(eq(systemSettings.key, key))
          .limit(1);
      });

      if (records && records.length > 0) {
        const item = records[0];
        try {
          return decryptToken({
            ciphertext: item.encryptedValue,
            iv: item.iv,
            authTag: item.authTag,
          });
        } catch (decryptErr) {
          console.error(`Failed to decrypt setting for key "${key}":`, decryptErr);
          // Fall back to env if decryption of database value fails
        }
      }
    } catch (err) {
      // Graceful fallback for test setups or DB connection issues
      // Do not crash the entire request if DB is offline
    }

    // Fallback to process.env
    const envVal = process.env[key];
    return envVal ? envVal.trim() : null;
  }

  /**
   * Sets (creates or updates) an encrypted setting in the database.
   */
  async setSetting(key: string, rawValue: string, description?: string): Promise<{ success: boolean; key: string }> {
    if (!key || !key.trim()) {
      throw new Error("Setting key cannot be empty");
    }
    const cleanKey = key.trim();
    const cleanVal = (rawValue ?? "").trim();
    if (!cleanVal) {
      throw new Error("Setting value cannot be empty");
    }

    const encrypted = encryptToken(cleanVal);

    await runWithAutoMigration(async () => {
      await db
        .insert(systemSettings)
        .values({
          id: crypto.randomUUID(),
          key: cleanKey,
          encryptedValue: encrypted.ciphertext,
          iv: encrypted.iv,
          authTag: encrypted.authTag,
          description: description?.trim() || null,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: systemSettings.key,
          set: {
            encryptedValue: encrypted.ciphertext,
            iv: encrypted.iv,
            authTag: encrypted.authTag,
            description: description !== undefined ? description.trim() || null : undefined,
            updatedAt: new Date(),
          },
        });
    });

    return { success: true, key: cleanKey };
  }

  /**
   * Deletes a setting from the database by key.
   */
  async deleteSetting(key: string): Promise<{ success: boolean; deleted: boolean }> {
    if (!key || !key.trim()) {
      throw new Error("Setting key cannot be empty");
    }
    const cleanKey = key.trim();

    try {
      const result = await runWithAutoMigration(async () => {
        return await db
          .delete(systemSettings)
          .where(eq(systemSettings.key, cleanKey))
          .returning({ id: systemSettings.id });
      });

      return { success: true, deleted: (result?.length || 0) > 0 };
    } catch (err) {
      console.error(`Failed to delete setting "${key}":`, err);
      throw err;
    }
  }

  /**
   * Returns a list of masked settings for display in dashboard.
   * Never exposes raw secret values.
   */
  async listSettingsMasked(): Promise<MaskedSetting[]> {
    const resultMap = new Map<string, MaskedSetting>();

    try {
      const records = await runWithAutoMigration(async () => {
        return await db
          .select()
          .from(systemSettings)
          .orderBy(desc(systemSettings.updatedAt));
      });

      for (const row of records) {
        let masked = "••••••••";
        let hasValue = false;
        try {
          const raw = decryptToken({
            ciphertext: row.encryptedValue,
            iv: row.iv,
            authTag: row.authTag,
          });
          if (raw) {
            hasValue = true;
            masked = maskSecretValue(raw);
          }
        } catch {
          masked = "[Decryption Failed]";
        }

        resultMap.set(row.key, {
          key: row.key,
          maskedValue: masked,
          hasValue,
          source: "DATABASE",
          description: row.description || null,
          updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
        });
      }
    } catch (err) {
      console.warn("Could not query systemSettings from database, listing from env only:", err);
    }

    // Merge known settings from environment if not overridden in database
    for (const known of KNOWN_SETTING_KEYS) {
      if (!resultMap.has(known.key)) {
        const envVal = process.env[known.key];
        if (envVal && envVal.trim()) {
          resultMap.set(known.key, {
            key: known.key,
            maskedValue: maskSecretValue(envVal.trim()),
            hasValue: true,
            source: "ENVIRONMENT",
            description: known.description,
            updatedAt: null,
          });
        }
      }
    }

    return Array.from(resultMap.values()).sort((a, b) => a.key.localeCompare(b.key));
  }
}

export const settingsService = new SettingsService();
