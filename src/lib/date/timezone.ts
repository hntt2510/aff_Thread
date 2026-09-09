export const DEFAULT_TIMEZONE = "Asia/Ho_Chi_Minh";

/**
 * Parses a local date (YYYY-MM-DD) and time (HH:mm) entered in a specific timezone
 * and converts it to a standard UTC JavaScript Date object.
 *
 * Defaults to Asia/Ho_Chi_Minh (UTC+7, no daylight saving time).
 */
export function parseLocalDateTimeToUtc(
  dateStr: string,
  timeStr: string,
  timezone: string = DEFAULT_TIMEZONE
): Date {
  if (!dateStr || !timeStr) {
    throw new Error("Date and time are both required to schedule a post");
  }

  const [yearStr, monthStr, dayStr] = dateStr.split("-");
  const [hourStr, minuteStr] = timeStr.split(":");

  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);
  const hour = parseInt(hourStr, 10);
  const minute = parseInt(minuteStr, 10);

  if (
    isNaN(year) ||
    isNaN(month) ||
    isNaN(day) ||
    isNaN(hour) ||
    isNaN(minute) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    throw new Error("Invalid date or time format");
  }

  if (timezone === "Asia/Ho_Chi_Minh") {
    // Asia/Ho_Chi_Minh is strictly UTC+7 without DST year-round
    const utcMillis = Date.UTC(year, month - 1, day, hour - 7, minute, 0, 0);
    return new Date(utcMillis);
  }

  // General fallback using Intl
  // Construct an ISO string without timezone and calculate the offset
  const localDate = new Date(`${dateStr}T${timeStr}:00`);
  return localDate;
}

/**
 * Validates that a scheduled timestamp is sufficiently in the future.
 * Prevents scheduling in the past or within an immediate grace threshold.
 */
export function validateScheduledTime(
  scheduledAt: Date,
  minLeadSeconds = 60
): { valid: boolean; error?: string } {
  const now = Date.now();
  const scheduledMillis = scheduledAt.getTime();

  if (isNaN(scheduledMillis)) {
    return { valid: false, error: "Invalid scheduled date timestamp" };
  }

  if (scheduledMillis <= now) {
    return { valid: false, error: "Scheduled time must be in the future" };
  }

  if (scheduledMillis < now + minLeadSeconds * 1000) {
    return {
      valid: false,
      error: `Scheduled time must be at least ${minLeadSeconds} seconds in the future`,
    };
  }

  return { valid: true };
}

/**
 * Formats a Date object or ISO string into a human-readable string in Asia/Ho_Chi_Minh timezone.
 */
export function formatInTimezone(
  date: Date | string,
  timezone: string = DEFAULT_TIMEZONE
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "Invalid date";

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}
