export type PostStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "PUBLISHING"
  | "PUBLISHED"
  | "FAILED"
  | "CANCELLED";

export const POST_STATUSES: readonly PostStatus[] = [
  "DRAFT",
  "SCHEDULED",
  "PUBLISHING",
  "PUBLISHED",
  "FAILED",
  "CANCELLED",
] as const;

/**
 * State machine defining permitted transitions between post lifecycle states.
 * Enforces strict boundaries to prevent data corruption and duplicate publishing.
 */
const VALID_TRANSITIONS: Record<PostStatus, readonly PostStatus[]> = {
  DRAFT: ["SCHEDULED", "PUBLISHING", "CANCELLED"],
  SCHEDULED: ["PUBLISHING", "CANCELLED", "SCHEDULED"], // self-transition allowed for rescheduling
  PUBLISHING: ["PUBLISHED", "FAILED", "SCHEDULED"], // SCHEDULED on retryable error with backoff
  FAILED: ["PUBLISHING", "CANCELLED"], // user manual retry or intentional discard
  CANCELLED: ["SCHEDULED"], // user can reschedule
  PUBLISHED: [], // Immutable terminal state — CANNOT transition to any other status
};

export class InvalidPostStatusTransitionError extends Error {
  from: PostStatus;
  to: PostStatus;

  constructor(from: PostStatus, to: PostStatus, message?: string) {
    super(message || `Invalid post status transition from '${from}' to '${to}'`);
    this.name = "InvalidPostStatusTransitionError";
    this.from = from;
    this.to = to;
  }
}

export function isValidPostStatus(status: string): status is PostStatus {
  return POST_STATUSES.includes(status as PostStatus);
}

export function canTransition(from: PostStatus, to: PostStatus): boolean {
  const allowed = VALID_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

export function assertValidTransition(from: PostStatus, to: PostStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidPostStatusTransitionError(from, to);
  }
}
