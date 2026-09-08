import { describe, it, expect, vi, beforeEach } from "vitest";
import { PostService } from "@/services/post.service";
import { AccountService } from "@/services/account.service";
import { threadsClient, ThreadsApiError } from "@/lib/threads/client";
import { db } from "@/db";
import { threadsAccounts, posts } from "@/db/schema";
import { eq } from "drizzle-orm";

describe("PostService Multi-Account Publishing & Lifecycle", () => {
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
});
