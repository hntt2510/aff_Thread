import { describe, it, expect, vi, beforeEach } from "vitest";
import { AccountService } from "@/services/account.service";
import { threadsClient, ThreadsApiError } from "@/lib/threads/client";
import { db } from "@/db";
import { threadsAccounts, posts } from "@/db/schema";
import { eq } from "drizzle-orm";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
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

describe.skipIf(!isDbReachable)("AccountService Multi-Account Operations", () => {
  let service: AccountService;

  beforeEach(async () => {
    service = new AccountService();
    vi.restoreAllMocks();
    // Clean tables for tests
    await db.delete(posts);
    await db.delete(threadsAccounts);
  });

  it("verifies and previews account identity from Meta API without storing", async () => {
    vi.spyOn(threadsClient, "getProfile").mockResolvedValue({
      id: "threads_user_1001",
      username: "user_one",
      name: "User One",
      threads_profile_picture_url: "https://example.com/pic1.jpg",
      threads_biography: "Bio 1",
    });

    const preview = await service.verifyToken("token_1001");
    expect(preview.threadsUserId).toBe("threads_user_1001");
    expect(preview.username).toBe("user_one");
    expect(preview.displayName).toBe("User One");

    // Ensure not saved to DB
    const list = await service.listAccounts();
    expect(list).toHaveLength(0);
  });

  it("adds account with encrypted token and does not expose plaintext in safe account", async () => {
    const rawToken = "super_secret_token_1001";
    vi.spyOn(threadsClient, "getProfile").mockResolvedValue({
      id: "threads_user_1001",
      username: "user_one",
      name: "User One",
      threads_profile_picture_url: "https://example.com/pic1.jpg",
      threads_biography: "Bio 1",
    });

    const safeAccount = await service.addAccount(rawToken);

    expect(safeAccount.threadsUserId).toBe("threads_user_1001");
    expect(safeAccount.username).toBe("user_one");
    expect(safeAccount.status).toBe("ACTIVE");

    // Check safe account does NOT have token properties
    expect((safeAccount as any).encryptedAccessToken).toBeUndefined();
    expect((safeAccount as any).tokenIv).toBeUndefined();
    expect((safeAccount as any).tokenAuthTag).toBeUndefined();
    expect((safeAccount as any).token).toBeUndefined();

    // Verify DB record stores encrypted components and NOT plaintext token
    const [dbRecord] = await db
      .select()
      .from(threadsAccounts)
      .where(eq(threadsAccounts.id, safeAccount.id));

    expect(dbRecord.encryptedAccessToken).toBeDefined();
    expect(dbRecord.encryptedAccessToken).not.toBe(rawToken);
    expect(dbRecord.tokenIv).toBeDefined();
    expect(dbRecord.tokenAuthTag).toBeDefined();

    // Verify token can be decrypted server-side
    const { token } = await service.getDecryptedTokenForAccount(safeAccount.id);
    expect(token).toBe(rawToken);
  });

  it("prevents duplicate account registration", async () => {
    vi.spyOn(threadsClient, "getProfile").mockResolvedValue({
      id: "threads_user_1001",
      username: "user_one",
      name: "User One",
    });

    await service.addAccount("token_1001");

    // Attempt to add same threadsUserId again
    await expect(service.addAccount("token_1001_again")).rejects.toThrow(
      "Account already exists. Use Replace Token instead."
    );
  });

  it("health check updates status to ACTIVE on successful profile verification", async () => {
    vi.spyOn(threadsClient, "getProfile").mockResolvedValue({
      id: "threads_user_1001",
      username: "user_one",
      name: "User One",
    });

    const account = await service.addAccount("token_1001");

    vi.spyOn(threadsClient, "getProfile").mockResolvedValue({
      id: "threads_user_1001",
      username: "user_one_updated",
      name: "User One Updated",
    });

    const checked = await service.checkAccount(account.id);
    expect(checked.status).toBe("ACTIVE");
    expect(checked.username).toBe("user_one_updated");
    expect(checked.lastCheckedAt).not.toBeNull();
  });

  it("health check marks account INVALID_TOKEN when token expired", async () => {
    vi.spyOn(threadsClient, "getProfile").mockResolvedValue({
      id: "threads_user_1001",
      username: "user_one",
      name: "User One",
    });

    const account = await service.addAccount("token_1001");

    vi.spyOn(threadsClient, "getProfile").mockRejectedValue(
      new ThreadsApiError("INVALID_TOKEN", "Session has expired", 401)
    );

    const checked = await service.checkAccount(account.id);
    expect(checked.status).toBe("INVALID_TOKEN");
  });

  it("health check marks account ERROR on temporary API failure", async () => {
    vi.spyOn(threadsClient, "getProfile").mockResolvedValue({
      id: "threads_user_1001",
      username: "user_one",
      name: "User One",
    });

    const account = await service.addAccount("token_1001");

    vi.spyOn(threadsClient, "getProfile").mockRejectedValue(
      new ThreadsApiError("NETWORK_ERROR", "Network down", 503)
    );

    const checked = await service.checkAccount(account.id);
    expect(checked.status).toBe("ERROR");
  });

  it("replaceToken replaces token when new token matches account identity", async () => {
    vi.spyOn(threadsClient, "getProfile").mockResolvedValue({
      id: "threads_user_1001",
      username: "user_one",
      name: "User One",
    });

    const account = await service.addAccount("old_token_1001");

    const newRawToken = "new_refreshed_token_1001";
    vi.spyOn(threadsClient, "getProfile").mockResolvedValue({
      id: "threads_user_1001",
      username: "user_one",
      name: "User One",
    });

    const replaced = await service.replaceToken(account.id, newRawToken);
    expect(replaced.status).toBe("ACTIVE");

    // Verify new token is stored and decrypted
    const { token } = await service.getDecryptedTokenForAccount(account.id);
    expect(token).toBe(newRawToken);
  });

  it("replaceToken strictly rejects token belonging to a DIFFERENT account", async () => {
    vi.spyOn(threadsClient, "getProfile").mockResolvedValue({
      id: "threads_user_1001",
      username: "user_one",
      name: "User One",
    });

    const account = await service.addAccount("token_1001");

    // Attacker or mistake: new token belongs to user_two
    vi.spyOn(threadsClient, "getProfile").mockResolvedValue({
      id: "threads_user_2002",
      username: "user_two",
      name: "User Two",
    });

    await expect(service.replaceToken(account.id, "token_2002")).rejects.toThrow(
      "Token belongs to a different account"
    );

    // Ensure original token was NOT overwritten
    const { token } = await service.getDecryptedTokenForAccount(account.id);
    expect(token).toBe("token_1001");
  });

  it("removes account successfully", async () => {
    vi.spyOn(threadsClient, "getProfile").mockResolvedValue({
      id: "threads_user_1001",
      username: "user_one",
      name: "User One",
    });

    const account = await service.addAccount("token_1001");
    expect(await service.listAccounts()).toHaveLength(1);

    await service.removeAccount(account.id);
    expect(await service.listAccounts()).toHaveLength(0);
  });
});
