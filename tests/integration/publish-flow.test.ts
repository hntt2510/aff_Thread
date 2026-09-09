import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET as getPostsHandler, POST as createPostHandler } from "@/app/api/posts/route";
import { GET as getStatsHandler } from "@/app/api/dashboard/stats/route";
import { NextRequest } from "next/server";
import { AccountService } from "@/services/account.service";
import { threadsClient } from "@/lib/threads/client";
import { db } from "@/db";
import { posts, threadsAccounts } from "@/db/schema";
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

describe.skipIf(!isDbReachable)("Publish API and Dashboard Stats Integration", () => {
  let accountService: AccountService;
  let activeAccount: any;

  beforeEach(async () => {
    accountService = new AccountService();
    vi.restoreAllMocks();

    await db.delete(posts);
    await db.delete(threadsAccounts);

    vi.spyOn(threadsClient, "getProfile").mockResolvedValue({
      id: "threads_user_test",
      username: "test_publisher",
      name: "Test Publisher",
    });

    activeAccount = await accountService.addAccount("token_test_abc");
  });

  it("publishes post via /api/posts route successfully", async () => {
    vi.spyOn(threadsClient, "createTextContainer").mockResolvedValue({
      id: "container_api_1",
    });
    vi.spyOn(threadsClient, "publishContainer").mockResolvedValue({
      id: "threads_post_api_1",
    });

    const req = new NextRequest("http://localhost:3000/api/posts", {
      method: "POST",
      body: JSON.stringify({
        accountId: activeAccount.id,
        text: "Integration test post via API",
      }),
    });

    const res = await createPostHandler(req);
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.post.threadsPostId).toBe("threads_post_api_1");
    expect(body.post.status).toBe("PUBLISHED");
  });

  it("lists published post in /api/posts history", async () => {
    vi.spyOn(threadsClient, "createTextContainer").mockResolvedValue({
      id: "container_api_2",
    });
    vi.spyOn(threadsClient, "publishContainer").mockResolvedValue({
      id: "threads_post_api_2",
    });

    const createReq = new NextRequest("http://localhost:3000/api/posts", {
      method: "POST",
      body: JSON.stringify({
        accountId: activeAccount.id,
        text: "History check post",
      }),
    });
    await createPostHandler(createReq);

    const listReq = new NextRequest("http://localhost:3000/api/posts");
    const listRes = await getPostsHandler(listReq);
    expect(listRes.status).toBe(200);

    const body = await listRes.json();
    expect(body.posts).toHaveLength(1);
    expect(body.posts[0].text).toBe("History check post");
    expect(body.posts[0].account.username).toBe("test_publisher");
  });

  it("reflects real counts in /api/dashboard/stats", async () => {
    // Current stats before any post: 1 connected account, 0 published, 0 failed
    const initialStatsRes = await getStatsHandler();
    const initialStats = await initialStatsRes.json();
    expect(initialStats.connectedAccounts).toBe(1);
    expect(initialStats.publishedPosts).toBe(0);
    expect(initialStats.failedPosts).toBe(0);

    // Now publish a post
    vi.spyOn(threadsClient, "createTextContainer").mockResolvedValue({
      id: "container_stat_1",
    });
    vi.spyOn(threadsClient, "publishContainer").mockResolvedValue({
      id: "post_stat_1",
    });

    const postReq = new NextRequest("http://localhost:3000/api/posts", {
      method: "POST",
      body: JSON.stringify({
        accountId: activeAccount.id,
        text: "Stats counting test post",
      }),
    });
    await createPostHandler(postReq);

    const updatedStatsRes = await getStatsHandler();
    const updatedStats = await updatedStatsRes.json();
    expect(updatedStats.connectedAccounts).toBe(1);
    expect(updatedStats.publishedPosts).toBe(1);
    expect(updatedStats.failedPosts).toBe(0);
  });
});
