import { chromium, BrowserContext, Page } from "playwright";
import path from "node:path";
import fs from "node:fs";

export interface BrowserContextOptions {
  profileDir?: string;
  headless?: boolean;
  viewport?: { width: number; height: number };
}

/**
 * Manages persistent Playwright browser context for the human operator session.
 * Stores browser storage/cookies strictly in the local gitignored directory.
 */
export class SessionBrowserManager {
  private context: BrowserContext | null = null;
  private profileDir: string;

  constructor(profileDir?: string) {
    this.profileDir =
      profileDir ||
      process.env.SHOPEE_PROFILE_DIR ||
      path.resolve(process.cwd(), ".local/shopee-session/profile");
  }

  getProfileDir(): string {
    return this.profileDir;
  }

  async launch(options?: BrowserContextOptions): Promise<BrowserContext> {
    if (this.context) {
      return this.context;
    }

    const targetProfileDir = options?.profileDir || this.profileDir;
    fs.mkdirSync(targetProfileDir, { recursive: true });

    // Headed by default for operator interactivity. Never default to headless for login.
    const headless = options?.headless ?? (process.env.SHOPEE_HEADLESS === "true");

    this.context = await chromium.launchPersistentContext(targetProfileDir, {
      headless,
      viewport: options?.viewport || { width: 1280, height: 800 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
      locale: "vi-VN",
      timezoneId: "Asia/Ho_Chi_Minh",
      args: [
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
        "--disable-infobars",
      ],
    });

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
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
  }
}

export const sessionBrowserManager = new SessionBrowserManager();
