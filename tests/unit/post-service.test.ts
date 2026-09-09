import { describe, it, expect, vi, beforeEach } from "vitest";
import { PostService } from "@/services/post.service";
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

describe.skipIf(!isDbReachable)("PostService Multi-Account Publishing & Lifecycle", () => {
  let postService: PostService;
  let accountService: AccountService;

  let accountA: any;
  let accountB: any;

  beforeEach(async () => {
    postService = new PostService();
    accountService = new AccountService();
    vi.restoreAllMocks();

    // Clean tables for tests
    await db.delete(posts);
    await db.delete(threadsAccounts);

    // Setup two distinct accounts in DB
    vi.spyOn(threadsClient, "getProfile").mockImplementation(async (token: string) => {
      if (token === "token_A_secret_111") {
        return {
          id: "threads_user_A",
          username: "account_a",
          name: "Account A",
        };
      }
      if (token === "token_B_secret_222") {
        return {
          id: "threads_user_B",
          username: "account_b",
          name: "Account B",
        };
      }
      throw new ThreadsApiError("INVALID_TOKEN", "Unknown token", 401);
    });

    accountA = await accountService.addAccount("token_A_secret_111");
    accountB = await accountService.addAccount("token_B_secret_222");
  });

  it("validates post content: rejects empty or whitespace text", async () => {
    await expect(postService.publishTextPost(accountA.id, "")).rejects.toThrow(
      "Post content cannot be empty or whitespace"
    );
    await expect(postService.publishTextPost(accountA.id, "   \n\t  ")).rejects.toThrow(
      "Post content cannot be empty or whitespace"
    );
  });

  it("validates post content: rejects text exceeding 500 characters", async () => {
    const longText = "a".repeat(501);
    await expect(postService.publishTextPost(accountA.id, longText)).rejects.toThrow(
      "Post content exceeds Threads limit of 500 characters"
    );
  });

  it("rejects publishing with inactive account", async () => {
    // Mark account B as INVALID_TOKEN
    await db
      .update(threadsAccounts)
      .set({ status: "INVALID_TOKEN" })
      .where(eq(threadsAccounts.id, accountB.id));

    await expect(
      postService.publishTextPost(accountB.id, "Valid text")
    ).rejects.toThrow("is currently in 'INVALID_TOKEN' status");
  });

  it("strictly isolates accounts: Account A uses Token A, Account B uses Token B", async () => {
    const createSpy = vi
      .spyOn(threadsClient, "createTextContainer")
      .mockResolvedValue({ id: "container_mock_id" });
    const publishSpy = vi
      .spyOn(threadsClient, "publishContainer")
      .mockResolvedValue({ id: "threads_post_mock_id" });

    // Publish using Account A
    await postService.publishTextPost(accountA.id, "Hello from Account A");
    expect(createSpy).toHaveBeenLastCalledWith("token_A_secret_111", "Hello from Account A");
    expect(publishSpy).toHaveBeenLastCalledWith("token_A_secret_111", "container_mock_id");

    // Publish using Account B
    await postService.publishTextPost(accountB.id, "Hello from Account B");
    expect(createSpy).toHaveBeenLastCalledWith("token_B_secret_222", "Hello from Account B");
    expect(publishSpy).toHaveBeenLastCalledWith("token_B_secret_222", "container_mock_id");
  });

  it("completes the two-stage publish lifecycle and stores post IDs", async () => {
    vi.spyOn(threadsClient, "createTextContainer").mockResolvedValue({
      id: "container_12345",
    });
    vi.spyOn(threadsClient, "publishContainer").mockResolvedValue({
      id: "threads_post_67890",
    });

    const published = await postService.publishTextPost(
      accountA.id,
      "Official 2-stage publish test"
    );

    expect(published.status).toBe("PUBLISHED");
    expect(published.containerId).toBe("container_12345");
    expect(published.threadsPostId).toBe("threads_post_67890");
    expect(published.publishedAt).not.toBeNull();

    // Verify persisted in DB
    const [dbPost] = await db.select().from(posts).where(eq(posts.id, published.id));
    expect(dbPost.status).toBe("PUBLISHED");
    expect(dbPost.containerId).toBe("container_12345");
    expect(dbPost.threadsPostId).toBe("threads_post_67890");
  });

  it("records FAILED status when container creation fails", async () => {
    vi.spyOn(threadsClient, "createTextContainer").mockRejectedValue(
      new ThreadsApiError("RATE_LIMIT", "Rate limit reached", 429)
    );

    await expect(
      postService.publishTextPost(accountA.id, "This will fail container creation")
    ).rejects.toThrow("Rate limit reached");

    const postList = await postService.listPosts();
    expect(postList).toHaveLength(1);
    expect(postList[0].status).toBe("FAILED");
    expect(postList[0].errorCode).toBe("RATE_LIMIT");
    expect(postList[0].containerId).toBeNull();
  });

  it("records FAILED status and preserves containerId when publish call fails", async () => {
    vi.spyOn(threadsClient, "createTextContainer").mockResolvedValue({
      id: "container_saved_123",
    });
    vi.spyOn(threadsClient, "publishContainer").mockRejectedValue(
      new ThreadsApiError("NETWORK_ERROR", "Connection reset", 503)
    );

    await expect(
      postService.publishTextPost(accountA.id, "This will fail publish")
    ).rejects.toThrow("Needs manual review");

    const postList = await postService.listPosts();
    expect(postList).toHaveLength(1);
    expect(postList[0].status).toBe("FAILED");
    // Crucial: Container ID must be preserved for auditability
    expect(postList[0].containerId).toBe("container_saved_123");
    expect(postList[0].errorCode).toBe("NEEDS_MANUAL_REVIEW");
  });

  it("account failure isolation: failure on Account A does not affect Account B", async () => {
    // Fail Account A
    vi.spyOn(threadsClient, "createTextContainer").mockRejectedValueOnce(
      new ThreadsApiError("API_ERROR", "Meta error on A", 500)
    );

    await expect(
      postService.publishTextPost(accountA.id, "Failing post for A")
    ).rejects.toThrow("Meta error on A");

    // Success on Account B
    vi.spyOn(threadsClient, "createTextContainer").mockResolvedValueOnce({
      id: "container_B_ok",
    });
    vi.spyOn(threadsClient, "publishContainer").mockResolvedValueOnce({
      id: "threads_post_B_ok",
    });

    const postB = await postService.publishTextPost(accountB.id, "Successful post for B");
    expect(postB.status).toBe("PUBLISHED");

    // Post history contains both records
    const postList = await postService.listPosts();
    expect(postList).toHaveLength(2);

    const recordA = postList.find((p) => p.accountId === accountA.id);
    const recordB = postList.find((p) => p.accountId === accountB.id);

    expect(recordA?.status).toBe("FAILED");
    expect(recordB?.status).toBe("PUBLISHED");
  });

  it("preserves post history and immutable account identity when account is removed/disconnected", async () => {
    vi.spyOn(threadsClient, "createTextContainer").mockResolvedValue({
      id: "container_audit_persist",
    });
    vi.spyOn(threadsClient, "publishContainer").mockResolvedValue({
      id: "threads_post_audit_persist",
    });

    // 1. Publish post using Account A
    const publishedPost = await postService.publishTextPost(
      accountA.id,
      "Post from Account A that should survive account removal"
    );
    expect(publishedPost.status).toBe("PUBLISHED");

    // Verify post appears in history with active account identity
    let history = await postService.listPosts();
    expect(history).toHaveLength(1);
    expect(history[0].account?.username).toBe("account_a");
    expect(history[0].account?.displayName).toBe("Account A");
    expect(history[0].account?.isDisconnected).toBe(false);

    // 2. Remove/disconnect Account A
    await accountService.removeAccount(accountA.id);

    // Verify account is removed from active accounts list (unavailable for new publishing)
    const activeAccounts = await accountService.listAccounts();
    expect(activeAccounts.find((a) => a.id === accountA.id)).toBeUndefined();

    // Verify publishing with removed account now fails
    await expect(
      postService.publishTextPost(accountA.id, "Attempting to publish with deleted account")
    ).rejects.toThrow("Account not found");

    // 3. Historical post remains completely intact with preserved identity
    history = await postService.listPosts();
    expect(history).toHaveLength(1);
    expect(history[0].id).toBe(publishedPost.id);
    expect(history[0].text).toBe("Post from Account A that should survive account removal");
    expect(history[0].threadsPostId).toBe("threads_post_audit_persist");

    // Preserved historical identity snapshot
    expect(history[0].account?.username).toBe("account_a");
    expect(history[0].account?.displayName).toBe("Account A");
    expect(history[0].account?.isDisconnected).toBe(true);
  });

  it("preserves cumulative attempt count and audit trail when operator retries a failed post", async () => {
    // 1. Seed a failed post that had 3 prior failed attempts
    const [failedPost] = await db
      .insert(posts)
      .values({
        accountId: accountA.id,
        accountThreadsUserId: "threads_user_A",
        accountUsername: "account_a",
        accountDisplayName: "Account A",
        text: "Post that failed 3 times",
        status: "FAILED",
        publishAttempts: 3,
        errorCode: "NETWORK_ERROR",
        errorMessage: "Connection timed out",
        failedAt: new Date(),
      })
      .returning();

    // Mock successful Threads publish for the operator retry
    vi.spyOn(threadsClient, "createTextContainer").mockResolvedValue({
      id: "container_retry_001",
    });
    vi.spyOn(threadsClient, "publishContainer").mockResolvedValue({
      id: "threads_post_retry_001",
    });

    // 2. Operator triggers retry
    const retriedPost = await postService.retryFailedPost(failedPost.id);

    // 3. Verify cumulative attempts incremented to 4 (NOT reset to 0)
    expect(retriedPost.status).toBe("PUBLISHED");
    expect(retriedPost.publishAttempts).toBe(4);
    expect(retriedPost.threadsPostId).toBe("threads_post_retry_001");

    // Verify database record
    const [dbRecord] = await db
      .select()
      .from(posts)
      .where(eq(posts.id, failedPost.id));
    expect(dbRecord.publishAttempts).toBe(4);
    expect(dbRecord.status).toBe("PUBLISHED");
  });

  it("safely recovers stale PUBLISHING posts to FAILED to prevent duplicate publishing", async () => {
    const pastTime = new Date(Date.now() - 20 * 60 * 1000); // 20 mins ago

    // Seed a post stuck in PUBLISHING from a crashed worker
    const [stalePost] = await db
      .insert(posts)
      .values({
        accountId: accountA.id,
        accountThreadsUserId: "threads_user_A",
        accountUsername: "account_a",
        accountDisplayName: "Account A",
        text: "Stale post from crashed container",
        status: "PUBLISHING",
        publishAttempts: 1,
        lastAttemptAt: pastTime,
      })
      .returning();

    // Recover stale posts older than 10 minutes
    const recoveredCount = await postService.recoverStalePublishingPosts(10);
    expect(recoveredCount).toBeGreaterThanOrEqual(1);

    // Verify the stale post transitioned to FAILED with descriptive timeout code
    const [dbRecord] = await db
      .select()
      .from(posts)
      .where(eq(posts.id, stalePost.id));
    expect(dbRecord.status).toBe("FAILED");
    expect(dbRecord.errorCode).toBe("STALE_PUBLISHING_TIMEOUT");
    expect(dbRecord.failedAt).not.toBeNull();
    // It is in FAILED, NOT SCHEDULED, guaranteeing NO blind duplicate publishing
  });
});
