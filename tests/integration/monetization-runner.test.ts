import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { POST as monetizationRunRoute } from "@/app/api/internal/monetization/run/route";
import { monetizationRunnerService } from "@/services/monetization-runner.service";
import { NextRequest } from "next/server";

describe("Monetization Runner Route Authentication & Execution", () => {
  const testSecret = "test_cron_secret_minimum_32_characters_long";

  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", testSecret);
    vi.spyOn(monetizationRunnerService, "run").mockResolvedValue({
      ok: true,
      runId: "run_test_123",
      collected: 2,
      evaluated: 2,
      eligible: 1,
      repliesClaimed: 1,
      repliesPublished: 1,
      repliesDeferred: 0,
      repliesFailed: 0,
      ambiguous: 0,
      durationMs: 150,
      errors: [],
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("rejects unauthenticated request with 401 Unauthorized", async () => {
    const req = new NextRequest("http://localhost:3000/api/internal/monetization/run", {
      method: "POST",
    });

    const res = await monetizationRunRoute(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("rejects invalid Bearer token with 401 Unauthorized", async () => {
    const req = new NextRequest("http://localhost:3000/api/internal/monetization/run", {
      method: "POST",
      headers: {
        Authorization: "Bearer wrong_secret_token",
      },
    });

    const res = await monetizationRunRoute(req);
    expect(res.status).toBe(401);
  });

  it("strictly rejects secret passed in query param (?cron_secret=...)", async () => {
    const req = new NextRequest(
      `http://localhost:3000/api/internal/monetization/run?cron_secret=${testSecret}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${testSecret}`,
        },
      }
    );

    const res = await monetizationRunRoute(req);
    expect(res.status).toBe(401);
  });

  it("authorizes valid Bearer CRON_SECRET and invokes runner", async () => {
    const req = new NextRequest("http://localhost:3000/api/internal/monetization/run", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testSecret}`,
        "x-monetization-source": "cron-job-org",
      },
    });

    const res = await monetizationRunRoute(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.collected).toBe(2);
    expect(body.evaluated).toBe(2);
    expect(body.eligible).toBe(1);
    expect(body.repliesPublished).toBe(1);
    expect(monetizationRunnerService.run).toHaveBeenCalledWith({
      triggerSource: "cron-job-org",
    });
  });
});
