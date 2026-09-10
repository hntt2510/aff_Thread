import { SessionStateMachine } from "./state-machine.js";
import { SessionState } from "../types.js";

export type SessionDetectionResult = SessionState;

export interface LoginLifecycleOptions {
  detector: () => Promise<SessionDetectionResult>;
  browserCloser: () => Promise<void>;
  profileDir: string;
  executablePath?: string | null;
  pollIntervalMs?: number;
  heartbeatIntervalMs?: number;
  logger?: {
    log: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
  };
  onExit?: (code: number) => void;
  sleepFn?: (ms: number) => Promise<void>;
  signalTarget?: {
    on: (event: string, listener: (...args: any[]) => void) => void;
    removeListener?: (event: string, listener: (...args: any[]) => void) => void;
  };
}

/**
 * Coordinates the interactive login lifecycle for real Google Chrome:
 * - Keeps headed Google Chrome open while operator authenticates.
 * - Handles CAPTCHA/OTP challenges gracefully without terminating or automated bypass.
 * - Confirms READY state once authenticated, keeping the browser open.
 * - Handles SIGINT (Ctrl+C) and SIGTERM gracefully, closing browser connection and preserving profile.
 */
export class LoginLifecycleRunner {
  private detector: () => Promise<SessionDetectionResult>;
  private browserCloser: () => Promise<void>;
  private profileDir: string;
  private executablePath: string | null;
  private pollIntervalMs: number;
  private heartbeatIntervalMs: number;
  private logger: {
    log: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
  };
  private onExit: (code: number) => void;
  private sleepFn: (ms: number) => Promise<void>;
  private signalTarget: {
    on: (event: string, listener: (...args: any[]) => void) => void;
    removeListener?: (event: string, listener: (...args: any[]) => void) => void;
  };

  private stateMachine: SessionStateMachine;
  private shutdownRequested = false;
  private isShuttingDown = false;
  private sigintHandler: (() => void) | null = null;
  private sigtermHandler: (() => void) | null = null;

  constructor(options: LoginLifecycleOptions) {
    this.detector = options.detector;
    this.browserCloser = options.browserCloser;
    this.profileDir = options.profileDir;
    this.executablePath = options.executablePath || null;
    this.pollIntervalMs = options.pollIntervalMs ?? 5000;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 30000;
    this.logger = options.logger ?? console;
    this.onExit = options.onExit ?? ((code) => process.exit(code));
    this.sleepFn =
      options.sleepFn ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.signalTarget = options.signalTarget ?? process;

    this.stateMachine = new SessionStateMachine("NOT_INITIALIZED");
  }

  getStateMachine(): SessionStateMachine {
    return this.stateMachine;
  }

  isShutdownRequested(): boolean {
    return this.shutdownRequested;
  }

  /**
   * Registers SIGINT and SIGTERM handlers for graceful shutdown on Ctrl+C.
   */
  private registerSignalHandlers(): void {
    this.sigintHandler = () => {
      this.handleShutdownSignal("SIGINT");
    };
    this.sigtermHandler = () => {
      this.handleShutdownSignal("SIGTERM");
    };

    this.signalTarget.on("SIGINT", this.sigintHandler);
    this.signalTarget.on("SIGTERM", this.sigtermHandler);
  }

  private removeSignalHandlers(): void {
    if (this.signalTarget.removeListener) {
      if (this.sigintHandler) {
        this.signalTarget.removeListener("SIGINT", this.sigintHandler);
        this.sigintHandler = null;
      }
      if (this.sigtermHandler) {
        this.signalTarget.removeListener("SIGTERM", this.sigtermHandler);
        this.sigtermHandler = null;
      }
    }
  }

  /**
   * Graceful signal handler:
   * 1. Stops polling
   * 2. Closes browser context/CDP cleanly
   * 3. Preserves profile directory
   * 4. Logs exit confirmation
   * 5. Exits 0
   */
  async handleShutdownSignal(signal: string): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;
    this.shutdownRequested = true;

    try {
      await this.browserCloser();
    } catch {
      // Ignore browser close error during shutdown
    }

    this.removeSignalHandlers();
    this.logger.log("\nShopee session worker stopped. Profile preserved.");
    this.onExit(0);
  }

  /**
   * Checks if an error indicates the browser was manually closed by the operator.
   */
  private isBrowserClosedError(err: unknown): boolean {
    if (!err) return false;
    const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
    return (
      msg.includes("has been closed") ||
      msg.includes("target closed") ||
      msg.includes("page closed") ||
      msg.includes("browser closed")
    );
  }

  /**
   * Runs the interactive operator login polling loop.
   */
  async run(): Promise<void> {
    this.registerSignalHandlers();

    let lastReportedState: SessionState | null = null;
    let lastHeartbeatTime = Date.now();
    let readyBannerPrinted = false;

    try {
      while (!this.shutdownRequested) {
        let detectedState: SessionDetectionResult | null = null;

        try {
          detectedState = await this.detector();
        } catch (err: unknown) {
          if (this.isBrowserClosedError(err)) {
            this.logger.log("\n[i] Google Chrome window was closed by the operator.");
            await this.handleShutdownSignal("BROWSER_CLOSED");
            return;
          }
          this.logger.warn(
            `\n[!] Warning: Unable to inspect session state (${err instanceof Error ? err.message : String(err)}). Retrying...`
          );
        }

        if (detectedState) {
          if (detectedState !== lastReportedState) {
            lastReportedState = detectedState;
            this.stateMachine.transitionTo(detectedState);
            lastHeartbeatTime = Date.now();

            if (detectedState === "READY") {
              if (!readyBannerPrinted) {
                readyBannerPrinted = true;
                this.logger.log("\n==================================================");
                this.logger.log("[✓] AUTHENTICATION SUCCESSFUL!");
                this.logger.log("==================================================");
                this.logger.log("Session Status:    READY");
                this.logger.log(`Verified At:       ${new Date().toISOString()}`);
                if (this.executablePath) {
                  this.logger.log(`Chrome Executable: ${this.executablePath}`);
                }
                this.logger.log(`Dedicated Profile: ${this.profileDir}`);
                this.logger.log("\nSession profile saved and ready for use.");
                this.logger.log("Google Chrome will remain open for your inspection.");
                this.logger.log("Press Ctrl+C at any time to close session and return to shell.");
                this.logger.log("\nYou can now execute in another terminal:");
                this.logger.log("  npm run shopee:status");
                this.logger.log("  npm run shopee:weekly -- --dry-run\n");
              }
            } else if (detectedState === "CHALLENGE_REQUIRED") {
              this.logger.log("\n==================================================");
              this.logger.log("[!] SECURITY VERIFICATION REQUIRED");
              this.logger.log("==================================================");
              this.logger.log("Manual verification required in the browser.");
              this.logger.log("Shopee has presented a security challenge / CAPTCHA puzzle / OTP.");
              this.logger.log("Please complete verification directly in the Google Chrome window.\n");
            } else if (detectedState === "LOGIN_REQUIRED") {
              this.logger.log("[...] Session status: LOGIN_REQUIRED");
              this.logger.log("Waiting for operator to log in via Google Chrome window...");
            } else if (detectedState === "EXPIRED") {
              this.logger.log("[...] Session status: EXPIRED");
              this.logger.log("Shopee Affiliate session has expired. Please log in again in Chrome window...");
            }
          } else {
            // Unchanged state: check heartbeat to avoid terminal silence without spamming
            const now = Date.now();
            if (now - lastHeartbeatTime >= this.heartbeatIntervalMs) {
              lastHeartbeatTime = now;
              if (detectedState === "READY") {
                this.logger.log("[heartbeat] Session active: READY. (Press Ctrl+C to close)");
              } else if (detectedState === "CHALLENGE_REQUIRED") {
                this.logger.log("[heartbeat] Waiting for manual verification in Google Chrome...");
              } else if (detectedState === "LOGIN_REQUIRED") {
                this.logger.log("[heartbeat] Waiting for operator login in Google Chrome window...");
              } else if (detectedState === "EXPIRED") {
                this.logger.log("[heartbeat] Session expired. Waiting for operator re-login...");
              }
            }
          }
        }

        if (!this.shutdownRequested) {
          await this.sleepFn(this.pollIntervalMs);
        }
      }
    } finally {
      this.removeSignalHandlers();
    }
  }

  /**
   * Explicitly stop polling (useful for programmatic or test teardown).
   */
  stop(): void {
    this.shutdownRequested = true;
    this.removeSignalHandlers();
  }
}
