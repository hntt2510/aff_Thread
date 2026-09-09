import { describe, it, expect, vi, beforeEach } from "vitest";
import { SchedulerService } from "@/services/scheduler.service";
import { postService } from "@/services/post.service";
import { db } from "@/db";
import { schedulerRuns } from "@/db/schema";
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

describe.skipIf(!isDbReachable)("Scheduler Observability & Health Card", () => {
  let schedulerService: SchedulerService;

  beforeEach(async () => {
    schedulerService = new SchedulerService();
    vi.restoreAllMocks();
    await db.delete(schedulerRuns);
  });

  it("persists scheduler execution details and source to scheduler_runs", async () => {
    vi.spyOn(postService, "recoverStalePublishingPosts").mockResolvedValue(0);
    vi.spyOn(postService, "claimDuePosts").mockResolvedValue([]);

    const result = await schedulerService.run(10, "cron-job-org");

    expect(result.ok).toBe(true);
    expect(result.claimed).toBe(0);

    const runs = await schedulerService.listRecentRuns(10);
    expect(runs).toHaveLength(1);
    expect(runs[0].triggerSource).toBe("cron-job-org");
    expect(runs[0].claimed).toBe(0);
    expect(runs[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it("records custom trigger source such as github-manual", async () => {
    vi.spyOn(postService, "recoverStalePublishingPosts").mockResolvedValue(1);
    vi.spyOn(postService, "claimDuePosts").mockResolvedValue([]);

    await schedulerService.run(5, "github-manual");

    const runs = await schedulerService.listRecentRuns(5);
    expect(runs).toHaveLength(1);
    expect(runs[0].triggerSource).toBe("github-manual");
    expect(runs[0].staleRecovered).toBe(1);
  });

  it("reports HEALTHY status when execution occurred recently", async () => {
    await db.insert(schedulerRuns).values({
      startedAt: new Date(Date.now() - 30 * 1000), // 30 seconds ago
      finishedAt: new Date(),
      triggerSource: "cron-job-org",
      claimed: 0,
      published: 0,
      rescheduled: 0,
      failed: 0,
      staleRecovered: 0,
      durationMs: 15,
    });

    const health = await schedulerService.getSchedulerHealth();
    expect(health.status).toBe("HEALTHY");
    expect(health.lastSeenMinutesAgo).toBe(0);
    expect(health.lastRun).toBeDefined();
  });

  it("reports DEGRADED status when execution is 5 minutes old", async () => {
    await db.insert(schedulerRuns).values({
      startedAt: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
      finishedAt: new Date(Date.now() - 5 * 60 * 1000 + 100),
      triggerSource: "cron-job-org",
      claimed: 0,
      published: 0,
      rescheduled: 0,
      failed: 0,
      staleRecovered: 0,
      durationMs: 100,
    });

    const health = await schedulerService.getSchedulerHealth();
    expect(health.status).toBe("DEGRADED");
    expect(health.lastSeenMinutesAgo).toBe(5);
  });

  it("reports STALE status when execution is more than 10 minutes old", async () => {
    await db.insert(schedulerRuns).values({
      startedAt: new Date(Date.now() - 15 * 60 * 1000), // 15 minutes ago
      finishedAt: new Date(Date.now() - 15 * 60 * 1000 + 50),
      triggerSource: "cron-job-org",
      claimed: 0,
      published: 0,
      rescheduled: 0,
      failed: 0,
      staleRecovered: 0,
      durationMs: 50,
    });

    const health = await schedulerService.getSchedulerHealth();
    expect(health.status).toBe("STALE");
    expect(health.lastSeenMinutesAgo).toBe(15);
  });

  it("reports UNKNOWN status when no runs have been recorded", async () => {
    const health = await schedulerService.getSchedulerHealth();
    expect(health.status).toBe("UNKNOWN");
    expect(health.lastRun).toBeNull();
    expect(health.lastSeenMinutesAgo).toBeNull();
  });
});
