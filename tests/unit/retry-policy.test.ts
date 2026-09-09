import { describe, it, expect } from "vitest";
import { determineRetryDecision, MAX_PUBLISH_ATTEMPTS } from "@/lib/posts/retry";
import { ThreadsApiError } from "@/lib/threads/client";

describe("Retry Policy & Error Classification", () => {
  it("defines MAX_PUBLISH_ATTEMPTS as 3", () => {
    expect(MAX_PUBLISH_ATTEMPTS).toBe(3);
  });

  describe("Non-retryable errors", () => {
    it("classifies INVALID_TOKEN as non-retryable and flags fatal account auth", () => {
      const err = new ThreadsApiError("INVALID_TOKEN", "Session expired or revoked", 401);
      const decision = determineRetryDecision(1, err);

      expect(decision.shouldRetry).toBe(false);
      expect(decision.nextStatus).toBe("FAILED");
      expect(decision.isFatalAccountAuth).toBe(true);
      expect(decision.errorCode).toBe("INVALID_TOKEN");
    });

    it("classifies PERMISSION_ERROR as non-retryable", () => {
      const err = new ThreadsApiError("PERMISSION_ERROR", "Action not allowed", 403);
      const decision = determineRetryDecision(1, err);

      expect(decision.shouldRetry).toBe(false);
      expect(decision.nextStatus).toBe("FAILED");
      expect(decision.isFatalAccountAuth).toBe(false);
      expect(decision.errorCode).toBe("PERMISSION_ERROR");
    });

    it("classifies 4xx client errors as non-retryable", () => {
      const err = new ThreadsApiError("API_ERROR", "Malformed parameter", 400);
      const decision = determineRetryDecision(1, err);

      expect(decision.shouldRetry).toBe(false);
      expect(decision.nextStatus).toBe("FAILED");
    });
  });

  describe("Retryable errors", () => {
    it("allows retry on NETWORK_ERROR when attempts < MAX_PUBLISH_ATTEMPTS", () => {
      const err = new ThreadsApiError("NETWORK_ERROR", "Socket hangup", 503);
      const decision = determineRetryDecision(1, err);

      expect(decision.shouldRetry).toBe(true);
      expect(decision.nextStatus).toBe("SCHEDULED");
      expect(decision.nextScheduledAt).toBeDefined();
      expect(decision.nextScheduledAt!.getTime()).toBeGreaterThan(Date.now());
      expect(decision.isFatalAccountAuth).toBe(false);
    });

    it("allows retry on RATE_LIMIT when attempts < MAX_PUBLISH_ATTEMPTS", () => {
      const err = new ThreadsApiError("RATE_LIMIT", "User request limit reached", 429);
      const decision = determineRetryDecision(2, err);

      expect(decision.shouldRetry).toBe(true);
      expect(decision.nextStatus).toBe("SCHEDULED");
      // Backoff for attempt 2 should be at least 4 minutes in future
      expect(decision.nextScheduledAt!.getTime()).toBeGreaterThan(Date.now() + 3 * 60 * 1000);
    });

    it("allows retry on 5xx server API_ERROR", () => {
      const err = new ThreadsApiError("API_ERROR", "Internal Meta Error", 502);
      const decision = determineRetryDecision(1, err);

      expect(decision.shouldRetry).toBe(true);
      expect(decision.nextStatus).toBe("SCHEDULED");
    });

    it("caps retry at MAX_PUBLISH_ATTEMPTS (attempt 3 fails terminally)", () => {
      const err = new ThreadsApiError("NETWORK_ERROR", "Socket timeout", 503);
      const decision = determineRetryDecision(3, err);

      expect(decision.shouldRetry).toBe(false);
      expect(decision.nextStatus).toBe("FAILED");
      expect(decision.nextScheduledAt).toBeUndefined();
    });

    it("prevents automatic retries when prior attempts already exceed MAX_PUBLISH_ATTEMPTS (operator retries)", () => {
      // If an operator manually retried after prior failures, attempts could be 4 or 5
      const err = new ThreadsApiError("NETWORK_ERROR", "Connection reset", 503);
      const decision4 = determineRetryDecision(4, err);
      expect(decision4.shouldRetry).toBe(false);
      expect(decision4.nextStatus).toBe("FAILED");

      const decision5 = determineRetryDecision(5, err);
      expect(decision5.shouldRetry).toBe(false);
      expect(decision5.nextStatus).toBe("FAILED");
    });
  });
});
