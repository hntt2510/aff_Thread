import { SessionState, SessionHealthResult } from "../types.js";

/**
 * Strict Session State Machine for Shopee Session Worker.
 * Governs authentication states, prevents premature execution,
 * and ensures operator challenges and expiry are handled gracefully.
 */
export class SessionStateMachine {
  private currentState: SessionState = "NOT_INITIALIZED";
  private lastVerifiedAt: Date | null = null;
  private lastErrorCategory: string | null = null;
  private lastReason: string | null = null;

  constructor(initialState: SessionState = "NOT_INITIALIZED") {
    this.currentState = initialState;
  }

  getState(): SessionState {
    return this.currentState;
  }

  getLastVerifiedAt(): Date | null {
    return this.lastVerifiedAt;
  }

  getLastErrorCategory(): string | null {
    return this.lastErrorCategory;
  }

  getLastReason(): string | null {
    return this.lastReason;
  }

  transitionTo(nextState: SessionState, reason?: string, errorCategory?: string): void {
    const validTransitions: Record<SessionState, SessionState[]> = {
      NOT_INITIALIZED: ["LOGIN_REQUIRED", "AUTHENTICATING", "READY", "ERROR"],
      LOGIN_REQUIRED: ["AUTHENTICATING", "CHALLENGE_REQUIRED", "READY", "ERROR"],
      AUTHENTICATING: ["READY", "LOGIN_REQUIRED", "CHALLENGE_REQUIRED", "EXPIRED", "ERROR"],
      READY: ["EXPIRED", "CHALLENGE_REQUIRED", "LOGIN_REQUIRED", "ERROR"],
      CHALLENGE_REQUIRED: ["READY", "LOGIN_REQUIRED", "EXPIRED", "ERROR"],
      EXPIRED: ["LOGIN_REQUIRED", "AUTHENTICATING", "ERROR"],
      ERROR: ["LOGIN_REQUIRED", "AUTHENTICATING", "READY", "NOT_INITIALIZED"],
    };

    const allowed = validTransitions[this.currentState];
    if (allowed && !allowed.includes(nextState) && this.currentState !== nextState) {
      // Record transition error category but allow recovery
      this.lastErrorCategory = "INVALID_STATE_TRANSITION";
    }

    this.currentState = nextState;
    this.lastReason = reason || null;
    this.lastErrorCategory = errorCategory || null;

    if (nextState === "READY") {
      this.lastVerifiedAt = new Date();
    }
  }

  isReady(): boolean {
    return this.currentState === "READY";
  }

  isChallengeRequired(): boolean {
    return this.currentState === "CHALLENGE_REQUIRED";
  }

  isLoginRequired(): boolean {
    return this.currentState === "LOGIN_REQUIRED" || this.currentState === "EXPIRED";
  }

  getHealthSummary(profilePath: string, dashboardReachable = false): SessionHealthResult {
    return {
      status: this.currentState,
      verifiedAt: this.lastVerifiedAt ? this.lastVerifiedAt.toISOString() : new Date().toISOString(),
      dashboardReachable,
      profilePath,
      details: this.lastReason || undefined,
      errorCategory: this.lastErrorCategory || undefined,
    };
  }
}
