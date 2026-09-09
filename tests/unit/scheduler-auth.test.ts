import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { POST as schedulerRoute } from "@/app/api/internal/scheduler/run/route";
import { schedulerService } from "@/services/scheduler.service";
import { NextRequest } from "next/server";
import { createSessionToken } from "@/lib/auth/session";

describe("Scheduler Route Authentication", () => {
  const testSecret = "test_cron_secret_minimum_32_characters_long";

  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", testSecret);
    vi.spyOn(schedulerService, "run").mockResolvedValue({
      ok: true,
      claimed: 0,
      published: 0,
      rescheduled: 0,
      failed: 0,
      staleRecovered: 0,
      durationMs: 5,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("rejects unauthenticated invocation with 401 Unauthorized", async () => {
    const req = new NextRequest("http://localhost:3000/api/internal/scheduler/run", {
      method: "POST",
    });

    const res = await schedulerRoute(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("rejects invocation with incorrect Bearer secret", async () => {
    const req = new NextRequest("http://localhost:3000/api/internal/scheduler/run", {
      method: "POST",
      headers: {
        Authorization: "Bearer invalid_secret",
      },
    });

    const res = await schedulerRoute(req);
    expect(res.status).toBe(401);
  });

  it("authorizes invocation with valid Authorization Bearer CRON_SECRET", async () => {
    const req = new NextRequest("http://localhost:3000/api/internal/scheduler/run", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testSecret}`,
      },
    });

    const res = await schedulerRoute(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(schedulerService.run).toHaveBeenCalled();
  });

  it("rejects invocation with ?cron_secret=<valid secret> query param without Authorization header (401)", async () => {
    const req = new NextRequest(
      `http://localhost:3000/api/internal/scheduler/run?cron_secret=${testSecret}`,
      {
        method: "POST",
      }
    );

    const res = await schedulerRoute(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("rejects invocation with x-cron-secret header without Authorization header (401)", async () => {
    const req = new NextRequest("http://localhost:3000/api/internal/scheduler/run", {
      method: "POST",
      headers: {
        "x-cron-secret": testSecret,
      },
    });

    const res = await schedulerRoute(req);
    expect(res.status).toBe(401);
  });
});
