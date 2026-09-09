import { ThreadsApiError } from "@/lib/threads/client";
import { sanitizeErrorMessage } from "@/lib/errors/sanitizer";

export const MAX_PUBLISH_ATTEMPTS = 3;

export interface RetryDecision {
  shouldRetry: boolean;
  nextStatus: "SCHEDULED" | "FAILED";
  nextScheduledAt?: Date;
  errorCode: string;
  errorMessage: string;
  isFatalAccountAuth: boolean;
}

/**
 * Evaluates whether an error during publishing should trigger a bounded retry or final failure.
 * Ensures non-retryable authentication or authorization errors fail immediately without burning attempts.
 */
export function determineRetryDecision(
  currentAttempts: number,
  error: unknown
): RetryDecision {
  const safeMessage = sanitizeErrorMessage(error, "Publishing failed");
  let errorCode = "UNKNOWN_ERROR";
  let isRetryable = false;
  let isFatalAccountAuth = false;

  if (error instanceof ThreadsApiError) {
    errorCode = error.code;
    switch (error.code) {
      case "INVALID_TOKEN":
        isRetryable = false;
        isFatalAccountAuth = true;
        break;
      case "PERMISSION_ERROR":
        isRetryable = false;
        break;
      case "RATE_LIMIT":
      case "NETWORK_ERROR":
        isRetryable = true;
        break;
      case "API_ERROR":
        // 5xx errors from Threads API are retryable; 4xx are client errors (malformed, etc.)
        isRetryable = error.status >= 500 && error.status < 600;
        break;
    }
  } else if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("network") || msg.includes("timeout") || msg.includes("econnreset")) {
      isRetryable = true;
      errorCode = "NETWORK_ERROR";
    }
  }

  // If retryable and hasn't exhausted MAX_PUBLISH_ATTEMPTS:
  if (isRetryable && currentAttempts < MAX_PUBLISH_ATTEMPTS) {
    // Linear backoff: attempt 1 -> 2 minutes, attempt 2 -> 4 minutes
    const backoffMinutes = currentAttempts * 2;
    const nextScheduledAt = new Date(Date.now() + backoffMinutes * 60 * 1000);

    return {
      shouldRetry: true,
      nextStatus: "SCHEDULED",
      nextScheduledAt,
      errorCode,
      errorMessage: safeMessage,
      isFatalAccountAuth: false,
    };
  }

  // Otherwise, terminal failure
  return {
    shouldRetry: false,
    nextStatus: "FAILED",
    errorCode,
    errorMessage: safeMessage,
    isFatalAccountAuth,
  };
}
