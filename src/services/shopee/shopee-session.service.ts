import { db } from "@/db";
import { shopeeSessions, type ShopeeSessionStatus } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { ensureDatabaseSchema } from "@/db/migrate";
import { shopeeCookieService } from "./shopee-cookie.service";
import { shopeeDirectApiClient, type GenerateLinkResult } from "./shopee-direct-api.client";

export interface PublicShopeeSessionStatus {
  isConfigured: boolean;
  status: ShopeeSessionStatus | "NO_SESSION";
  username: string | null;
  affiliateId: string | null;
  lastValidatedAt: string | null;
  updatedAt: string | null;
  lastError: string | null;
}

let isSchemaEnsured = false;

async function runWithAutoMigration<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (err: unknown) {
    const errorStr = String(err);
    if (
      !isSchemaEnsured &&
      (errorStr.includes("shopee_sessions") ||
        errorStr.includes("does not exist") ||
        errorStr.includes("42P01"))
    ) {
      try {
        await ensureDatabaseSchema();
        isSchemaEnsured = true;
        return await action();
      } catch (migErr) {
        console.error("Auto-migration execution failed:", migErr);
      }
    }
    throw err;
  }
}

export class ShopeeSessionService {
  /**
   * Get sanitized public status for dashboard UI.
   * Never exposes raw cookies or encryption keys.
   */
  async getSessionStatus(): Promise<PublicShopeeSessionStatus> {
    return runWithAutoMigration(async () => {
      const records = await db
        .select()
        .from(shopeeSessions)
        .orderBy(desc(shopeeSessions.updatedAt))
        .limit(1);

      if (records.length === 0) {
        return {
          isConfigured: false,
          status: "NO_SESSION",
          username: null,
          affiliateId: null,
          lastValidatedAt: null,
          updatedAt: null,
          lastError: null,
        };
      }

      const session = records[0];
      return {
        isConfigured: true,
        status: session.status,
        username: session.username,
        affiliateId: session.affiliateId,
        lastValidatedAt: session.lastValidatedAt ? session.lastValidatedAt.toISOString() : null,
        updatedAt: session.updatedAt ? session.updatedAt.toISOString() : null,
        lastError: session.lastError,
      };
    });
  }

  /**
   * Saves or updates session cookies.
   * Encrypts cookies at rest and tests immediately with Shopee API.
   */
  async saveSession(rawInput: string, testImmediately = true): Promise<{
    success: boolean;
    status: ShopeeSessionStatus;
    error?: string;
    detectedKeys: string[];
  }> {
    const parseResult = shopeeCookieService.parseCookies(rawInput);
    if (!parseResult.valid) {
      return {
        success: false,
        status: "INVALID",
        error: parseResult.error,
        detectedKeys: parseResult.detectedKeys,
      };
    }

    // Encrypt cookies
    const encrypted = shopeeCookieService.encryptCookies(parseResult.cookies);

    let initialStatus: ShopeeSessionStatus = "ACTIVE";
    let lastError: string | null = null;
    let validatedAt: Date | null = null;

    if (testImmediately) {
      const validation = await shopeeDirectApiClient.validateSession(parseResult.cookieHeader);
      initialStatus = validation.status;
      lastError = validation.error || null;
      if (validation.isValid) {
        validatedAt = new Date();
      }
    }

    // Extract username if SPC_U or username is in cookies
    const potentialUsername = parseResult.cookies["SPC_U"] || null;

    return runWithAutoMigration(async () => {
      // Check if an existing session exists to update, otherwise insert
      const existing = await db
        .select({ id: shopeeSessions.id })
        .from(shopeeSessions)
        .orderBy(desc(shopeeSessions.updatedAt))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(shopeeSessions)
          .set({
            encryptedCookies: encrypted.ciphertext,
            cookiesIv: encrypted.iv,
            cookiesAuthTag: encrypted.authTag,
            status: initialStatus,
            username: potentialUsername,
            lastValidatedAt: validatedAt,
            lastError,
            updatedAt: new Date(),
          })
          .where(eq(shopeeSessions.id, existing[0].id));
      } else {
        await db.insert(shopeeSessions).values({
          encryptedCookies: encrypted.ciphertext,
          cookiesIv: encrypted.iv,
          cookiesAuthTag: encrypted.authTag,
          status: initialStatus,
          username: potentialUsername,
          lastValidatedAt: validatedAt,
          lastError,
        });
      }

      return {
        success: initialStatus === "ACTIVE",
        status: initialStatus,
        error: lastError || undefined,
        detectedKeys: parseResult.detectedKeys,
      };
    });
  }

  /**
   * Retrieves decrypted session cookie header for authorized internal operations.
   */
  async getActiveCookieHeader(): Promise<{
    cookieHeader: string | null;
    status: ShopeeSessionStatus | "NO_SESSION";
    sessionId?: string;
  }> {
    return runWithAutoMigration(async () => {
      const records = await db
        .select()
        .from(shopeeSessions)
        .orderBy(desc(shopeeSessions.updatedAt))
        .limit(1);

      if (records.length === 0) {
        return { cookieHeader: null, status: "NO_SESSION" };
      }

      const session = records[0];
      try {
        const cookies = shopeeCookieService.decryptCookies({
          ciphertext: session.encryptedCookies,
          iv: session.cookiesIv,
          authTag: session.cookiesAuthTag,
        });

        return {
          cookieHeader: shopeeCookieService.toCookieHeader(cookies),
          status: session.status,
          sessionId: session.id,
        };
      } catch (err: unknown) {
        return { cookieHeader: null, status: "INVALID" };
      }
    });
  }

  /**
   * Tests the currently active session against Shopee API and updates database status.
   */
  async testActiveSession(): Promise<{
    isValid: boolean;
    status: ShopeeSessionStatus | "NO_SESSION";
    error?: string;
  }> {
    const { cookieHeader, status, sessionId } = await this.getActiveCookieHeader();

    if (!cookieHeader || !sessionId) {
      return {
        isValid: false,
        status: "NO_SESSION",
        error: "No Shopee session is currently stored",
      };
    }

    const validation = await shopeeDirectApiClient.validateSession(cookieHeader);

    await db
      .update(shopeeSessions)
      .set({
        status: validation.status,
        lastValidatedAt: validation.isValid ? new Date() : undefined,
        lastError: validation.error || null,
        updatedAt: new Date(),
      })
      .where(eq(shopeeSessions.id, sessionId));

    return {
      isValid: validation.isValid,
      status: validation.status,
      error: validation.error,
    };
  }

  /**
   * Generates direct affiliate short link using the active Shopee session.
   */
  async generateAffiliateLink(productUrl: string, subIds?: string[]): Promise<GenerateLinkResult> {
    const { cookieHeader, status, sessionId } = await this.getActiveCookieHeader();

    if (!cookieHeader || !sessionId || status !== "ACTIVE") {
      return {
        success: false,
        error: "Active Shopee session cookies are required. Please update your session.",
        errorCategory: "AUTH_EXPIRED",
      };
    }

    const result = await shopeeDirectApiClient.generateCustomLink(productUrl, cookieHeader, subIds);

    // If authentication expired, mark session as EXPIRED in database
    if (!result.success && result.errorCategory === "AUTH_EXPIRED") {
      await db
        .update(shopeeSessions)
        .set({
          status: "EXPIRED",
          lastError: result.error,
          updatedAt: new Date(),
        })
        .where(eq(shopeeSessions.id, sessionId));
    }

    return result;
  }

  /**
   * Disconnects / removes stored Shopee session.
   */
  async deleteSession(): Promise<boolean> {
    return runWithAutoMigration(async () => {
      await db.delete(shopeeSessions);
      return true;
    });
  }
}

export const shopeeSessionService = new ShopeeSessionService();
