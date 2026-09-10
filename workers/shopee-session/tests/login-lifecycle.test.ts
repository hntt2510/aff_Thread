import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import { LoginLifecycleRunner, SessionDetectionResult } from "../src/session/login-lifecycle.js";
import { sessionBrowserManager } from "../src/browser/browser-context.js";

describe("Login Lifecycle Runner Abstraction", () => {
  it("keeps polling on LOGIN_REQUIRED and does not immediately terminate", async () => {
    let pollCount = 0;
    const detector = vi.fn(async (): Promise<SessionDetectionResult> => {
      pollCount++;
      return "LOGIN_REQUIRED";
    });

    const browserCloser = vi.fn(async () => {});
    const loggedMessages: string[] = [];
    const logger = {
      log: (msg: string) => loggedMessages.push(msg),
      warn: (msg: string) => loggedMessages.push(msg),
      error: (msg: string) => loggedMessages.push(msg),
    };

    let runner: LoginLifecycleRunner;

    const sleepFn = vi.fn(async () => {
      if (pollCount >= 3) {
        runner.stop();
      }
    });

    runner = new LoginLifecycleRunner({
      detector,
      browserCloser,
      profileDir: ".local/shopee-session/profile",
      pollIntervalMs: 10,
      heartbeatIntervalMs: 1000,
      logger,
      sleepFn,
      signalTarget: new EventEmitter(),
    });

    await runner.run();

    expect(pollCount).toBeGreaterThanOrEqual(3);
    expect(runner.getStateMachine().getState()).toBe("LOGIN_REQUIRED");
    // Browser must NOT have been closed during polling
    expect(browserCloser).not.toHaveBeenCalled();
    expect(loggedMessages.some((m) => m.includes("LOGIN_REQUIRED"))).toBe(true);
  });

  it("transitions correctly to READY and keeps session alive until shutdown", async () => {
    let tick = 0;
    const detector = vi.fn(async (): Promise<SessionDetectionResult> => {
      tick++;
      if (tick === 1) return "LOGIN_REQUIRED";
      return "READY";
    });

    const browserCloser = vi.fn(async () => {});
    const loggedMessages: string[] = [];
    const logger = {
      log: (msg: string) => loggedMessages.push(msg),
      warn: (msg: string) => loggedMessages.push(msg),
      error: (msg: string) => loggedMessages.push(msg),
    };

    let runner: LoginLifecycleRunner;

    const sleepFn = vi.fn(async () => {
      if (tick >= 3) {
        runner.stop();
      }
    });

    runner = new LoginLifecycleRunner({
      detector,
      browserCloser,
      profileDir: ".local/shopee-session/profile",
      pollIntervalMs: 10,
      heartbeatIntervalMs: 1000,
      logger,
      sleepFn,
      signalTarget: new EventEmitter(),
    });

    await runner.run();

    expect(runner.getStateMachine().getState()).toBe("READY");
    expect(runner.getStateMachine().isReady()).toBe(true);
    // Success banner must have been logged
    expect(loggedMessages.some((m) => m.includes("AUTHENTICATION SUCCESSFUL!"))).toBe(true);
    expect(loggedMessages.some((m) => m.includes("Session Status: READY"))).toBe(true);
    // Even after reaching READY, browser was NOT immediately closed
    expect(browserCloser).not.toHaveBeenCalled();
  });

  it("remains alive when CHALLENGE_REQUIRED (CAPTCHA/OTP) is detected", async () => {
    let tick = 0;
    const detector = vi.fn(async (): Promise<SessionDetectionResult> => {
      tick++;
      if (tick === 1) return "CHALLENGE_REQUIRED";
      return "READY";
    });

    const browserCloser = vi.fn(async () => {});
    const loggedMessages: string[] = [];
    const logger = {
      log: (msg: string) => loggedMessages.push(msg),
      warn: (msg: string) => loggedMessages.push(msg),
      error: (msg: string) => loggedMessages.push(msg),
    };

    let runner: LoginLifecycleRunner;

    const sleepFn = vi.fn(async () => {
      if (tick >= 2) {
        runner.stop();
      }
    });

    runner = new LoginLifecycleRunner({
      detector,
      browserCloser,
      profileDir: ".local/shopee-session/profile",
      pollIntervalMs: 10,
      heartbeatIntervalMs: 1000,
      logger,
      sleepFn,
      signalTarget: new EventEmitter(),
    });

    await runner.run();

    // Verify challenge message was presented to operator
    expect(loggedMessages.some((m) => m.includes("Manual verification required in the browser."))).toBe(true);
    expect(loggedMessages.some((m) => m.includes("security challenge / CAPTCHA puzzle / OTP"))).toBe(true);
    // And subsequently transitioned to READY
    expect(runner.getStateMachine().getState()).toBe("READY");
    expect(browserCloser).not.toHaveBeenCalled();
  });

  it("gracefully performs cleanup on SIGINT and preserves profile", async () => {
    const mockEmitter = new EventEmitter();
    const detector = vi.fn(async (): Promise<SessionDetectionResult> => "LOGIN_REQUIRED");
    const browserCloser = vi.fn(async () => {});
    const loggedMessages: string[] = [];
    const logger = {
      log: (msg: string) => loggedMessages.push(msg),
      warn: (msg: string) => loggedMessages.push(msg),
      error: (msg: string) => loggedMessages.push(msg),
    };

    let exitCode: number | null = null;
    const onExit = vi.fn((code: number) => {
      exitCode = code;
    });

    const runner = new LoginLifecycleRunner({
      detector,
      browserCloser,
      profileDir: ".local/shopee-session/profile",
      pollIntervalMs: 10,
      heartbeatIntervalMs: 1000,
      logger,
      onExit,
      signalTarget: mockEmitter,
    });

    const runPromise = runner.run();

    // Simulate operator pressing Ctrl+C (SIGINT)
    mockEmitter.emit("SIGINT");
    await runPromise;

    expect(browserCloser).toHaveBeenCalledTimes(1);
    expect(loggedMessages.some((m) => m.includes("Shopee session worker stopped. Profile preserved."))).toBe(true);
    expect(exitCode).toBe(0);
  });

  it("preserves persistent profile path configuration", () => {
    const defaultProfile = sessionBrowserManager.getProfileDir();
    const normalized = defaultProfile.replace(/\\/g, "/");
    expect(normalized).toContain(".local/shopee-session/profile");
    expect(normalized).toMatch(/\.local\/shopee-session\/profile$/);
  });
});
