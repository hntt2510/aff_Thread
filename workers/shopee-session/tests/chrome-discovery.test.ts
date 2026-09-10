import { describe, it, expect } from "vitest";
import path from "node:path";
import {
  findChromeExecutable,
  getCandidateChromePaths,
} from "../src/browser/chrome-discovery.js";
import {
  resolveDedicatedProfileDir,
  validateDedicatedProfile,
} from "../src/browser/profile-resolver.js";

describe("Chrome Executable Discovery & Dedicated Profile Resolver", () => {
  describe("Chrome Executable Discovery", () => {
    it("returns candidate paths for Windows including Program Files and LocalAppData", () => {
      const candidates = getCandidateChromePaths("win32", {
        ProgramFiles: "C:\\Program Files",
        "ProgramFiles(x86)": "C:\\Program Files (x86)",
        LOCALAPPDATA: "C:\\Users\\TestUser\\AppData\\Local",
      });

      expect(candidates.some((p) => p.includes("Program Files\\Google\\Chrome\\Application\\chrome.exe"))).toBe(true);
      expect(candidates.some((p) => p.includes("Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"))).toBe(true);
      expect(candidates.some((p) => p.includes("AppData\\Local\\Google\\Chrome\\Application\\chrome.exe"))).toBe(true);
    });

    it("returns candidate paths for macOS", () => {
      const candidates = getCandidateChromePaths("darwin", {});
      expect(candidates.some((p) => p.includes("/Applications/Google Chrome.app"))).toBe(true);
    });

    it("returns candidate paths for Linux", () => {
      const candidates = getCandidateChromePaths("linux", {});
      expect(candidates.some((p) => p.includes("/usr/bin/google-chrome"))).toBe(true);
      expect(candidates.some((p) => p.includes("/usr/bin/chromium"))).toBe(true);
    });

    it("prioritizes CHROME_PATH environment variable if provided", () => {
      const customBinary = "D:\\Tools\\Chrome\\chrome.exe";
      const candidates = getCandidateChromePaths("win32", {
        CHROME_PATH: customBinary,
      });

      expect(candidates[0]).toBe(customBinary);
    });

    it("discovers installed Chrome executable on current host if available", () => {
      try {
        const found = findChromeExecutable();
        expect(found).toBeTruthy();
        expect(found.toLowerCase()).toContain("chrome");
      } catch (err: unknown) {
        // If test runs in an environment where Chrome is not installed, error must be descriptive
        expect((err as Error).message).toContain("Google Chrome executable not found");
      }
    });

    it("throws a descriptive error when no Chrome executable exists", () => {
      const fakeFs = () => false; // Pretend no file exists
      expect(() =>
        findChromeExecutable({
          platform: "win32",
          env: {},
          fsExists: fakeFs,
        })
      ).toThrowError(/Google Chrome executable not found on host/);
    });

    it("throws when specified customPath does not exist", () => {
      expect(() =>
        findChromeExecutable({
          customPath: "Z:\\NonExistent\\Chrome\\chrome.exe",
          fsExists: () => false,
        })
      ).toThrowError(/Specified Chrome executable does not exist/);
    });
  });

  describe("Dedicated Profile Resolution & Security Guard", () => {
    it("resolves default dedicated profile to .local/shopee-chrome-profile", () => {
      const profile = resolveDedicatedProfileDir();
      const normalized = profile.replace(/\\/g, "/");
      expect(normalized).toContain(".local/shopee-chrome-profile");
      expect(normalized).toMatch(/\.local\/shopee-chrome-profile$/);
    });

    it("strictly forbids using the user's default/personal Windows Chrome profile", () => {
      const personalProfile = "C:\\Users\\Operator\\AppData\\Local\\Google\\Chrome\\User Data";
      expect(() => validateDedicatedProfile(personalProfile)).toThrowError(
        /Using user's default\/personal Chrome profile/
      );

      const personalDefault = "C:\\Users\\Operator\\AppData\\Local\\Google\\Chrome\\User Data\\Default";
      expect(() => validateDedicatedProfile(personalDefault)).toThrowError(
        /Using user's default\/personal Chrome profile/
      );
    });

    it("strictly forbids using the user's personal macOS and Linux Chrome profiles", () => {
      const macPersonal = "/Users/operator/Library/Application Support/Google/Chrome/Default";
      expect(() => validateDedicatedProfile(macPersonal)).toThrowError(
        /Using user's default\/personal Chrome profile/
      );

      const linuxPersonal = "/home/operator/.config/google-chrome/Default";
      expect(() => validateDedicatedProfile(linuxPersonal)).toThrowError(
        /Using user's default\/personal Chrome profile/
      );
    });

    it("never selects the personal Chrome profile automatically even if custom env points to it", () => {
      expect(() =>
        resolveDedicatedProfileDir("C:\\Users\\Admin\\AppData\\Local\\Google\\Chrome\\User Data")
      ).toThrowError(/Using user's default\/personal Chrome profile/);
    });
  });
});
