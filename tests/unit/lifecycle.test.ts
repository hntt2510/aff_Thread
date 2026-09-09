import { describe, it, expect } from "vitest";
import {
  canTransition,
  assertValidTransition,
  InvalidPostStatusTransitionError,
  isValidPostStatus,
  POST_STATUSES,
} from "@/lib/posts/lifecycle";

describe("Post Lifecycle State Machine", () => {
  it("recognizes all standard post statuses", () => {
    expect(POST_STATUSES).toEqual([
      "DRAFT",
      "SCHEDULED",
      "PUBLISHING",
      "PUBLISHED",
      "FAILED",
      "CANCELLED",
    ]);

    for (const status of POST_STATUSES) {
      expect(isValidPostStatus(status)).toBe(true);
    }
    expect(isValidPostStatus("UNKNOWN")).toBe(false);
    expect(isValidPostStatus("")).toBe(false);
  });

  describe("Permitted transitions", () => {
    it("allows DRAFT to transition to SCHEDULED, PUBLISHING, CANCELLED", () => {
      expect(canTransition("DRAFT", "SCHEDULED")).toBe(true);
      expect(canTransition("DRAFT", "PUBLISHING")).toBe(true);
      expect(canTransition("DRAFT", "CANCELLED")).toBe(true);
      expect(() => assertValidTransition("DRAFT", "SCHEDULED")).not.toThrow();
    });

    it("allows SCHEDULED to transition to PUBLISHING, CANCELLED, or rescheduled", () => {
      expect(canTransition("SCHEDULED", "PUBLISHING")).toBe(true);
      expect(canTransition("SCHEDULED", "CANCELLED")).toBe(true);
      expect(canTransition("SCHEDULED", "SCHEDULED")).toBe(true); // rescheduling
    });

    it("allows PUBLISHING to transition to PUBLISHED, FAILED, or SCHEDULED (retry)", () => {
      expect(canTransition("PUBLISHING", "PUBLISHED")).toBe(true);
      expect(canTransition("PUBLISHING", "FAILED")).toBe(true);
      expect(canTransition("PUBLISHING", "SCHEDULED")).toBe(true);
    });

    it("allows FAILED to transition to PUBLISHING (retry) or CANCELLED (discard)", () => {
      expect(canTransition("FAILED", "PUBLISHING")).toBe(true);
      expect(canTransition("FAILED", "CANCELLED")).toBe(true);
    });

    it("allows CANCELLED to transition to SCHEDULED (reschedule)", () => {
      expect(canTransition("CANCELLED", "SCHEDULED")).toBe(true);
    });
  });

  describe("Forbidden transitions", () => {
    it("forbids PUBLISHED from transitioning to ANY state (immutable terminal)", () => {
      expect(canTransition("PUBLISHED", "SCHEDULED")).toBe(false);
      expect(canTransition("PUBLISHED", "PUBLISHING")).toBe(false);
      expect(canTransition("PUBLISHED", "FAILED")).toBe(false);
      expect(canTransition("PUBLISHED", "CANCELLED")).toBe(false);
      expect(canTransition("PUBLISHED", "DRAFT")).toBe(false);

      expect(() => assertValidTransition("PUBLISHED", "SCHEDULED")).toThrow(
        InvalidPostStatusTransitionError
      );
    });

    it("forbids DRAFT from jumping directly to PUBLISHED without publish attempt", () => {
      expect(canTransition("DRAFT", "PUBLISHED")).toBe(false);
      expect(() => assertValidTransition("DRAFT", "PUBLISHED")).toThrow(
        InvalidPostStatusTransitionError
      );
    });

    it("forbids CANCELLED from jumping directly to PUBLISHING without rescheduling", () => {
      expect(canTransition("CANCELLED", "PUBLISHING")).toBe(false);
      expect(() => assertValidTransition("CANCELLED", "PUBLISHING")).toThrow(
        InvalidPostStatusTransitionError
      );
    });
  });
});
