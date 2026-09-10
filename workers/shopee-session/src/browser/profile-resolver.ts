import path from "node:path";

/**
 * Validates that a target profile directory is a dedicated isolated worker directory
 * and NOT the user's personal default Chrome profile directory.
 * Throws a SecurityError if the directory matches standard default profile paths.
 */
export function validateDedicatedProfile(profileDir: string): void {
  const normalized = profileDir.replace(/\\/g, "/").toLowerCase();

  // Forbidden personal Chrome profile patterns across Windows, macOS, Linux
  const forbiddenPatterns = [
    "/google/chrome/user data",
    "/google/chrome/default",
    "/application support/google/chrome/default",
    "/application support/google/chrome/user data",
    "/.config/google-chrome/default",
    "/.config/google-chrome",
  ];

  for (const forbidden of forbiddenPatterns) {
    if (normalized.includes(forbidden)) {
      throw new Error(
        `Security Guard: Using user's default/personal Chrome profile (${profileDir}) is strictly forbidden. ` +
          `The Shopee worker must operate within a dedicated profile directory (e.g. .local/shopee-chrome-profile).`
      );
    }
  }
}

/**
 * Resolves the dedicated local Chrome profile directory for Shopee Affiliate session.
 * Defaults strictly to: workers/shopee-session/.local/shopee-chrome-profile/
 */
export function resolveDedicatedProfileDir(customDir?: string): string {
  if (customDir) {
    validateDedicatedProfile(customDir);
    return path.resolve(customDir);
  }

  const envDir = process.env.SHOPEE_CHROME_PROFILE_DIR || process.env.SHOPEE_PROFILE_DIR;
  if (envDir) {
    validateDedicatedProfile(envDir);
    return path.resolve(envDir);
  }

  const cwd = process.cwd();
  // Ensure stable path resolution whether run from workspace root or workers/shopee-session
  const workerBase = cwd.endsWith("shopee-session")
    ? cwd
    : path.resolve(cwd, "workers/shopee-session");

  const defaultDir = path.resolve(workerBase, ".local/shopee-chrome-profile");
  validateDedicatedProfile(defaultDir);
  return defaultDir;
}
