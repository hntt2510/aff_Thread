import { describe, it, expect, vi } from "vitest";
import { getIsoWeek, WeeklyAcquisitionRunner } from "../src/jobs/weekly-acquisition.js";
import { MainAppClient } from "../src/transport/main-app-client.js";

describe("Weekly Acquisition Runner & Security", () => {
  it("computes ISO week format correctly", () => {
    const testDate = new Date("2026-09-09T12:00:00Z");
    const week = getIsoWeek(testDate);
    expect(week).toMatch(/^\d{4}-W\d{2}$/);
    expect(week).toBe("2026-W37");
  });

  it("fails early if secret is missing when sending batch", async () => {
    const client = new MainAppClient({ baseUrl: "http://localhost:3000", secret: "" });
    expect(client.isConfigured()).toBe(false);

    await expect(
      client.sendBatch({
        provider: "SHOPEE",
        acquisitionBatchId: "TEST",
        week: "2026-W37",
        capturedAt: new Date().toISOString(),
        source: "SHOPEE_SESSION_WORKER",
        products: [],
      })
    ).rejects.toThrow("SHOPEE_WORKER_SECRET is not configured");
  });

  it("does not leak secret in error messages or logs", async () => {
    const secret = "super-sensitive-shopee-secret-999";
    const client = new MainAppClient({
      baseUrl: "http://localhost:9999", // non-existent server
      secret,
    });

    try {
      await client.sendBatch(
        {
          provider: "SHOPEE",
          acquisitionBatchId: "TEST",
          week: "2026-W37",
          capturedAt: new Date().toISOString(),
          source: "SHOPEE_SESSION_WORKER",
          products: [],
        },
        1
      );
      expect.unreachable();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).not.toContain(secret);
    }
  });
});
