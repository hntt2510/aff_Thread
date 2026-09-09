import { describe, it, expect } from "vitest";
import { getCurrentIsoWeek, weeklyPoolService } from "@/services/shopee/weekly-pool.service";

describe("WeeklyPoolService", () => {
  it("formats ISO week string according to standard YYYY-Www", () => {
    const testDate = new Date("2026-09-09T12:00:00.000Z");
    const week = getCurrentIsoWeek(testDate);
    expect(week).toMatch(/^\d{4}-W\d{2}$/);
    expect(week).toBe("2026-W37");
  });

  it("lists available historical weeks as an array", async () => {
    const weeks = await weeklyPoolService.listAvailableWeeks();
    expect(Array.isArray(weeks)).toBe(true);
  });
});
