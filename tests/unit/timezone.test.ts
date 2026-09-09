import { describe, it, expect } from "vitest";
import {
  parseLocalDateTimeToUtc,
  validateScheduledTime,
  formatInTimezone,
  DEFAULT_TIMEZONE,
} from "@/lib/date/timezone";

describe("Timezone & Scheduling Utilities", () => {
  it("defaults to Asia/Ho_Chi_Minh", () => {
    expect(DEFAULT_TIMEZONE).toBe("Asia/Ho_Chi_Minh");
  });

  it("correctly converts Asia/Ho_Chi_Minh local time (UTC+7) to UTC Date", () => {
    // 2026-11-10 15:30 in Vietnam (UTC+7) should be 2026-11-10 08:30:00.000 UTC
    const date = parseLocalDateTimeToUtc("2026-11-10", "15:30", "Asia/Ho_Chi_Minh");

    expect(date.toISOString()).toBe("2026-11-10T08:30:00.000Z");
  });

  it("handles midnight edge case crossing date boundary", () => {
    // 2026-01-01 02:00 in Vietnam is 2025-12-31 19:00:00.000 UTC
    const date = parseLocalDateTimeToUtc("2026-01-01", "02:00", "Asia/Ho_Chi_Minh");

    expect(date.toISOString()).toBe("2025-12-31T19:00:00.000Z");
  });

  it("rejects invalid date or time input strings", () => {
    expect(() => parseLocalDateTimeToUtc("", "12:00")).toThrow();
    expect(() => parseLocalDateTimeToUtc("2026-13-01", "12:00")).toThrow();
    expect(() => parseLocalDateTimeToUtc("2026-01-01", "25:00")).toThrow();
  });

  it("validates scheduled future timestamps", () => {
    const futureDate = new Date(Date.now() + 3600 * 1000); // 1 hour ahead
    const pastDate = new Date(Date.now() - 3600 * 1000); // 1 hour ago
    const immediateDate = new Date(Date.now() + 10 * 1000); // 10s ahead (too close)

    expect(validateScheduledTime(futureDate, 60).valid).toBe(true);
    expect(validateScheduledTime(pastDate, 60).valid).toBe(false);
    expect(validateScheduledTime(immediateDate, 60).valid).toBe(false);
  });

  it("formats Date into Asia/Ho_Chi_Minh representation", () => {
    const utcDate = new Date("2026-11-10T08:30:00.000Z");
    const formatted = formatInTimezone(utcDate, "Asia/Ho_Chi_Minh");

    // Should include Nov, 10, 2026 and 15:30
    expect(formatted).toContain("10");
    expect(formatted).toContain("Nov");
    expect(formatted).toContain("2026");
    expect(formatted).toContain("15:30");
  });
});
