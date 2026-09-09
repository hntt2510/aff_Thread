import { db } from "@/db";
import { threadsAccounts, ThreadsAccount } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { encryptToken, decryptToken } from "@/lib/crypto/tokens";
import { threadsClient, ThreadsApiError } from "@/lib/threads/client";

export type SafeAccount = Omit<
  ThreadsAccount,
  "encryptedAccessToken" | "tokenIv" | "tokenAuthTag"
>;

export class AccountService {
  /**
   * Step 1: Verify token with Meta API and preview account identity before storing.
   */
  async verifyToken(accessToken: string) {
    const profile = await threadsClient.getProfile(accessToken);
    return {
      threadsUserId: profile.id,
      username: profile.username,
      displayName: profile.name,
      avatarUrl: profile.threads_profile_picture_url || null,
      biography: profile.threads_biography || null,
    };
  }

  /**
   * Step 2: Persist new verified account. Enforces uniqueness.
   */
  async addAccount(accessToken: string): Promise<SafeAccount> {
    const identity = await this.verifyToken(accessToken);

    // Check if account already exists
    const [existing] = await db
      .select()
      .from(threadsAccounts)
      .where(eq(threadsAccounts.threadsUserId, identity.threadsUserId))
      .limit(1);

    if (existing) {
      throw new Error("Account already exists. Use Replace Token instead.");
    }

    // Encrypt token before persisting
    const encrypted = encryptToken(accessToken);

    const [created] = await db
      .insert(threadsAccounts)
      .values({
        threadsUserId: identity.threadsUserId,
        username: identity.username,
        displayName: identity.displayName,
        avatarUrl: identity.avatarUrl,
        biography: identity.biography,
        encryptedAccessToken: encrypted.ciphertext,
        tokenIv: encrypted.iv,
        tokenAuthTag: encrypted.authTag,
        status: "ACTIVE",
        lastCheckedAt: new Date(),
      })
      .returning();

    return this.toSafeAccount(created);
  }

  /**
   * List all accounts safely without exposing token components.
   */
  async listAccounts(): Promise<SafeAccount[]> {
    const accounts = await db
      .select({
        id: threadsAccounts.id,
        threadsUserId: threadsAccounts.threadsUserId,
        username: threadsAccounts.username,
        displayName: threadsAccounts.displayName,
        avatarUrl: threadsAccounts.avatarUrl,
        biography: threadsAccounts.biography,
        status: threadsAccounts.status,
        lastCheckedAt: threadsAccounts.lastCheckedAt,
        createdAt: threadsAccounts.createdAt,
        updatedAt: threadsAccounts.updatedAt,
      })
      .from(threadsAccounts)
      .orderBy(desc(threadsAccounts.createdAt));

    return accounts;
  }

  /**
   * Decrypts token for a specific account. Server-side only!
   */
  async getDecryptedTokenForAccount(id: string): Promise<{ token: string; account: SafeAccount }> {
    const [account] = await db
      .select()
      .from(threadsAccounts)
      .where(eq(threadsAccounts.id, id))
      .limit(1);

    if (!account) {
      throw new Error(`Account not found: ${id}`);
    }

    const token = decryptToken({
      ciphertext: account.encryptedAccessToken,
      iv: account.tokenIv,
      authTag: account.tokenAuthTag,
    });

    return { token, account: this.toSafeAccount(account) };
  }

  /**
   * Runs a health check on an existing account by verifying token validity against Meta.
   */
  async checkAccount(id: string): Promise<SafeAccount> {
    const [account] = await db
      .select()
      .from(threadsAccounts)
      .where(eq(threadsAccounts.id, id))
      .limit(1);

    if (!account) {
      throw new Error("Account not found");
    }

    const now = new Date();

    try {
      const decryptedToken = decryptToken({
        ciphertext: account.encryptedAccessToken,
        iv: account.tokenIv,
        authTag: account.tokenAuthTag,
      });

      const profile = await threadsClient.getProfile(decryptedToken);

      // Never allow a token for a different account to overwrite stored identity
      if (profile.id !== account.threadsUserId) {
        const [updated] = await db
          .update(threadsAccounts)
          .set({
            status: "ERROR",
            lastCheckedAt: now,
            updatedAt: now,
          })
          .where(eq(threadsAccounts.id, id))
          .returning();
        return this.toSafeAccount(updated);
      }

      // Valid profile match
      const [updated] = await db
        .update(threadsAccounts)
        .set({
          status: "ACTIVE",
          username: profile.username,
          displayName: profile.name,
          avatarUrl: profile.threads_profile_picture_url || account.avatarUrl,
          biography: profile.threads_biography || account.biography,
          lastCheckedAt: now,
          updatedAt: now,
        })
        .where(eq(threadsAccounts.id, id))
        .returning();

      return this.toSafeAccount(updated);
    } catch (err) {
      let newStatus = "ERROR";
      if (err instanceof ThreadsApiError && err.code === "INVALID_TOKEN") {
        newStatus = "INVALID_TOKEN";
      }

      const [updated] = await db
        .update(threadsAccounts)
        .set({
          status: newStatus,
          lastCheckedAt: now,
          updatedAt: now,
        })
        .where(eq(threadsAccounts.id, id))
        .returning();

      if (!updated) {
        throw new Error("Account not found");
      }
      return this.toSafeAccount(updated);
    }
  }

  /**
   * Replace token for an existing account. Strictly verifies identity matches stored account.
   */
  async replaceToken(id: string, newToken: string): Promise<SafeAccount> {
    const [account] = await db
      .select()
      .from(threadsAccounts)
      .where(eq(threadsAccounts.id, id))
      .limit(1);

    if (!account) {
      throw new Error("Account not found");
    }

    // Verify identity with Meta
    const profile = await threadsClient.getProfile(newToken);

    // Stored Threads ID MUST equal returned Threads User ID
    if (profile.id !== account.threadsUserId) {
      throw new Error(
        `Token belongs to a different account (@${profile.username}, ID: ${profile.id}). Cannot replace token for @${account.username}.`
      );
    }

    // Encrypt new token
    const encrypted = encryptToken(newToken);
    const now = new Date();

    const [updated] = await db
      .update(threadsAccounts)
      .set({
        encryptedAccessToken: encrypted.ciphertext,
        tokenIv: encrypted.iv,
        tokenAuthTag: encrypted.authTag,
        status: "ACTIVE",
        username: profile.username,
        displayName: profile.name,
        avatarUrl: profile.threads_profile_picture_url || account.avatarUrl,
        biography: profile.threads_biography || account.biography,
        lastCheckedAt: now,
        updatedAt: now,
      })
      .where(eq(threadsAccounts.id, id))
      .returning();

    return this.toSafeAccount(updated);
  }

  /**
   * Remove account permanently.
   */
  async removeAccount(id: string): Promise<void> {
    await db.delete(threadsAccounts).where(eq(threadsAccounts.id, id));
  }

  private toSafeAccount(account: ThreadsAccount): SafeAccount {
    return {
      id: account.id,
      threadsUserId: account.threadsUserId,
      username: account.username,
      displayName: account.displayName,
      avatarUrl: account.avatarUrl,
      biography: account.biography,
      status: account.status,
      lastCheckedAt: account.lastCheckedAt,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    };
  }
}

export const accountService = new AccountService();
