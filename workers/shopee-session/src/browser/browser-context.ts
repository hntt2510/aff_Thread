import { chromium, Browser, BrowserContext, Page } from "playwright";
import { spawn, ChildProcess } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import { findChromeExecutable } from "./chrome-discovery.js";
import { resolveDedicatedProfileDir } from "./profile-resolver.js";

export interface BrowserContextOptions {
  profileDir?: string;
  executablePath?: string;
  debugPort?: number;
  headless?: boolean;
}

/**
 * Checks whether an HTTP endpoint is currently responding to version requests.
 */
export async function isCdpPortResponding(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/json/version`, { timeout: 800 }, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * Manages dedicated Google Chrome process and Playwright CDP connection.
 * Connects to a dedicated installed Google Chrome instance without automation flags.
 * Preserves the isolated local profile in .local/shopee-chrome-profile.
 */
export class SessionBrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private spawnedProcess: ChildProcess | null = null;
  private profileDir: string;
  private executablePath: string | null = null;
  private debugPort: number;

  constructor(profileDir?: string, customExecutable?: string, debugPort?: number) {
    this.profileDir = profileDir || resolveDedicatedProfileDir();
    this.executablePath = customExecutable || null;
    this.debugPort = debugPort || parseInt(process.env.SHOPEE_DEBUG_PORT || "9222", 10);
  }

  getProfileDir(): string {
    return this.profileDir;
  }

  getChromeExecutablePath(): string | null {
    return this.executablePath;
  }

  getDebugPort(): number {
    return this.debugPort;
  }

  async launch(options?: BrowserContextOptions): Promise<BrowserContext> {
    if (this.context && this.browser) {
      return this.context;
    }

    const targetProfileDir = options?.profileDir || this.profileDir;
    const targetPort = options?.debugPort || this.debugPort;
    const headless = options?.headless ?? (process.env.SHOPEE_HEADLESS === "true");

    fs.mkdirSync(targetProfileDir, { recursive: true });

    // 1. Check if Chrome is already active on the designated remote debugging port
    const alreadyResponding = await isCdpPortResponding(targetPort);

    if (!alreadyResponding) {
      // 2. Discover host Google Chrome executable
      const chromeExecutable =
        options?.executablePath ||
        this.executablePath ||
        findChromeExecutable({ customPath: process.env.CHROME_PATH });
      this.executablePath = chromeExecutable;

      // 3. Launch genuine Google Chrome process with dedicated user-data-dir and remote debugging
      const chromeArgs = [
        `--remote-debugging-port=${targetPort}`,
        `--user-data-dir=${targetProfileDir}`,
        "--no-first-run",
        "--no-default-browser-check",
      ];

      if (headless) {
        chromeArgs.push("--headless=new");
      }

      this.spawnedProcess = spawn(chromeExecutable, chromeArgs, {
        detached: true,
        stdio: "ignore",
      });
      this.spawnedProcess.unref();

      // 4. Poll until the CDP endpoint responds
      const startTime = Date.now();
      const timeoutMs = 15000;
      let ready = false;

      while (Date.now() - startTime < timeoutMs) {
        ready = await isCdpPortResponding(targetPort);
        if (ready) break;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }

      if (!ready) {
        throw new Error(
          `Failed to connect to Google Chrome remote debugging port (${targetPort}) within 15 seconds. ` +
            `Ensure Chrome executable (${chromeExecutable}) is accessible and port ${targetPort} is available.`
        );
      }
    }

    // 5. Connect Playwright over CDP to the explicitly launched real Chrome instance
    this.browser = await chromium.connectOverCDP(`http://127.0.0.1:${targetPort}`);
    const contexts = this.browser.contexts();
    this.context = contexts[0] || (await this.browser.newContext());

    return this.context;
  }

  async getPage(): Promise<Page> {
    const ctx = await this.launch();
    const pages = ctx.pages();
    if (pages.length > 0) {
      return pages[0];
    }
    return ctx.newPage();
  }

  async close(): Promise<void> {
    if (this.browser) {
      try {
        await this.browser.close();
      } catch {
        // Ignore CDP disconnect errors
      }
      this.browser = null;
      this.context = null;
    }
  }
}

export const sessionBrowserManager = new SessionBrowserManager();
