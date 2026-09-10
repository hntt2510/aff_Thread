import fs from "node:fs";
import path from "node:path";

export interface ChromeDiscoveryOptions {
  customPath?: string;
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  fsExists?: (p: string) => boolean;
}

/**
 * Returns a list of candidate file paths where Google Chrome is commonly installed
 * on the target operating system.
 */
export function getCandidateChromePaths(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env
): string[] {
  const candidates: string[] = [];

  // 1. Explicit environment overrides take first priority
  if (env.CHROME_PATH) {
    candidates.push(env.CHROME_PATH);
  }
  if (env.SHOPEE_CHROME_PATH) {
    candidates.push(env.SHOPEE_CHROME_PATH);
  }

  // 2. OS-specific standard installation paths
  if (platform === "win32") {
    const programFiles = env["ProgramFiles"] || "C:\\Program Files";
    const programFilesX86 = env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
    const localAppData =
      env["LOCALAPPDATA"] ||
      (env["USERPROFILE"] ? path.join(env["USERPROFILE"], "AppData", "Local") : "");
    const programW6432 = env["PROGRAMW6432"];

    candidates.push(
      path.join(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(programFilesX86, "Google", "Chrome", "Application", "chrome.exe"),
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
    );

    if (localAppData) {
      candidates.push(path.join(localAppData, "Google", "Chrome", "Application", "chrome.exe"));
    }

    if (programW6432) {
      candidates.push(path.join(programW6432, "Google", "Chrome", "Application", "chrome.exe"));
    }
  } else if (platform === "darwin") {
    candidates.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chrome.app/Contents/MacOS/Chrome"
    );
  } else {
    // Linux and BSD flavors
    candidates.push(
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      "/snap/bin/chromium"
    );
  }

  // Return clean, deduplicated list
  return Array.from(new Set(candidates.filter(Boolean)));
}

/**
 * Discovers the real Google Chrome executable installed on the host machine.
 * Throws a descriptive error if no valid binary is located.
 */
export function findChromeExecutable(options?: ChromeDiscoveryOptions): string {
  const platform = options?.platform || process.platform;
  const env = options?.env || process.env;
  const fileExists = options?.fsExists || fs.existsSync;

  if (options?.customPath) {
    if (fileExists(options.customPath)) {
      return path.resolve(options.customPath);
    }
    throw new Error(`Specified Chrome executable does not exist at: ${options.customPath}`);
  }

  const candidates = getCandidateChromePaths(platform, env);

  for (const candidate of candidates) {
    try {
      if (fileExists(candidate)) {
        return path.resolve(candidate);
      }
    } catch {
      // Continue searching on filesystem permission error
    }
  }

  throw new Error(
    `Google Chrome executable not found on host (platform: "${platform}").\n` +
      `Checked standard locations:\n` +
      candidates.map((c) => `  - ${c}`).join("\n") +
      `\nPlease install Google Chrome or specify its location using the CHROME_PATH environment variable.`
  );
}
