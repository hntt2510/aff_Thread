import { describe, it, expect, vi, beforeEach } from "vitest";
import { insightsCollectorService } from "@/services/insights-collector.service";
import { threadsClient } from "@/lib/threads/client";
import { accountService } from "@/services/account.service";
import { db } from "@/db";
import { posts, threadsAccounts, postInsightSnapshots } from "@/db/schema";
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

describe.skipIf(!isDbReachable)("Insights Collector Service", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();

    await db.delete(postInsightSnapshots);
    await db.delete(posts);
    await db.delete(threadsAccounts);
  });

  it("collects and persists snapshots for published posts with error isolation", async () => {
    // 1. Setup active account
    const [account] = await db
      .insert(threadsAccounts)
      .values({
        threadsUserId: "user_test_insights_1",
        username: "test_insights_user",
        displayName: "Insights Tester",
        encryptedAccessToken: "enc_token_123",
        tokenIv: "iv_123",
        tokenAuthTag: "tag_123",
        status: "ACTIVE",
      })
      .returning();

    // 2. Setup two published posts
    const [post1] = await db
      .insert(posts)
      .values({
        accountId: account.id,
        accountThreadsUserId: account.threadsUserId,
        accountUsername: account.username,
        accountDisplayName: account.displayName,
        text: "Post 1 with insights",
        threadsPostId: "tp_111111",
        status: "PUBLISHED",
      })
      .returning();

    const [post2] = await db
      .insert(posts)
      .values({
        accountId: account.id,
        accountThreadsUserId: account.threadsUserId,
        accountUsername: account.username,
        accountDisplayName: account.displayName,
        text: "Post 2 that fails",
        threadsPostId: "tp_222222",
        status: "PUBLISHED",
      })
      .returning();

    vi.spyOn(accountService, "getDecryptedTokenForAccount").mockResolvedValue({
      token: "decrypted_token_xyz",
      account: account as any,
    });

    // Post 1 succeeds, Post 2 fails
    vi.spyOn(threadsClient, "getPostInsights").mockImplementation(async (_token, mediaId) => {
      if (mediaId === "tp_111111") {
        return {
          views: 500,
          likes: 25,
          replies: 4,
          reposts: 2,
          quotes: 1,
          shares: null,
          rawMetricsJson: { mock: true },
        };
      }
      throw new Error("Meta rate limit exceeded on post 2");
    });

    const result = await insightsCollectorService.collectInsights({ minIntervalMinutes: 0 });

    expect(result.collectedCount).toBe(1);
    expect(result.failedCount).toBe(1);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain("Meta rate limit exceeded on post 2");

    // Verify snapshot in database
    const snapshots = await insightsCollectorService.getPostSnapshots(post1.id);
    expect(snapshots.length).toBe(1);
    expect(snapshots[0].views).toBe(500);
    expect(snapshots[0].likes).toBe(25);
    expect(snapshots[0].threadsPostId).toBe("tp_111111");
  });
});
