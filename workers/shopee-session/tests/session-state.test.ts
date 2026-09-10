import { describe, it, expect } from "vitest";
import { SessionStateMachine } from "../src/session/state-machine.js";

describe("Worker Session State Machine", () => {
  it("initializes in NOT_INITIALIZED state", () => {
    const sm = new SessionStateMachine();
    expect(sm.getState()).toBe("NOT_INITIALIZED");
    expect(sm.isReady()).toBe(false);
  });

  it("transitions cleanly through normal login flow", () => {
    const sm = new SessionStateMachine();

    sm.transitionTo("LOGIN_REQUIRED", "No existing session found");
    expect(sm.getState()).toBe("LOGIN_REQUIRED");
    expect(sm.isLoginRequired()).toBe(true);

    sm.transitionTo("AUTHENTICATING", "Operator launched login window");
    expect(sm.getState()).toBe("AUTHENTICATING");

    sm.transitionTo("READY", "Detected user avatar and account name");
    expect(sm.getState()).toBe("READY");
    expect(sm.isReady()).toBe(true);
    expect(sm.getLastVerifiedAt()).toBeInstanceOf(Date);
  });

  it("handles security challenge states", () => {
    const sm = new SessionStateMachine("AUTHENTICATING");

    sm.transitionTo("CHALLENGE_REQUIRED", "Shopee CAPTCHA puzzle detected");
    expect(sm.getState()).toBe("CHALLENGE_REQUIRED");
    expect(sm.isChallengeRequired()).toBe(true);
    expect(sm.isReady()).toBe(false);

    // After operator solves challenge in browser
    sm.transitionTo("READY", "Puzzle solved");
    expect(sm.getState()).toBe("READY");
    expect(sm.isReady()).toBe(true);
  });

  it("handles session expiry and re-login", () => {
    const sm = new SessionStateMachine("READY");

    sm.transitionTo("EXPIRED", "Received HTTP 302 to login page");
    expect(sm.getState()).toBe("EXPIRED");
    expect(sm.isLoginRequired()).toBe(true);
    expect(sm.isReady()).toBe(false);

    sm.transitionTo("LOGIN_REQUIRED");
    expect(sm.getState()).toBe("LOGIN_REQUIRED");
  });

  it("formats health summary without sensitive leakage", () => {
    const sm = new SessionStateMachine("READY");
    const summary = sm.getHealthSummary(".local/shopee-chrome-profile", true);

    expect(summary.status).toBe("READY");
    expect(summary.dashboardReachable).toBe(true);
    expect(summary.profilePath).toBe(".local/shopee-chrome-profile");

    const json = JSON.stringify(summary);
    expect(json).not.toContain("cookie");
    expect(json).not.toContain("password");
    expect(json).not.toContain("token");
  });
});
