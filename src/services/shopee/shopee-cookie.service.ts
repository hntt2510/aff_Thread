import { encryptToken, decryptToken, type EncryptedData } from "@/lib/crypto/tokens";

export interface ParsedCookiesResult {
  valid: boolean;
  cookies: Record<string, string>;
  cookieHeader: string;
  error?: string;
  detectedKeys: string[];
}

// Known Shopee authentication & session cookie names
export const SHOPEE_AUTH_COOKIE_KEYS = [
  "SPC_EC",
  "SPC_ST",
  "SPC_U",
  "SPC_F",
  "SPC_T_ID",
  "SPC_T_IV",
  "SPC_SI",
  "shopee_token",
] as const;

export class ShopeeCookieService {
  /**
   * Parse arbitrary cookie input (Cookie-Editor JSON array, raw header string, or JSON map)
   * into a normalized key-value record of cookies.
   */
  parseCookies(input: string): ParsedCookiesResult {
    if (!input || !input.trim()) {
      return {
        valid: false,
        cookies: {},
        cookieHeader: "",
        error: "Cookie input cannot be empty.",
        detectedKeys: [],
      };
    }

    const trimmed = input.trim();
    const cookies: Record<string, string> = {};

    // 1. Try parsing as JSON (Cookie-Editor format or key-value object)
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed);

        if (Array.isArray(parsed)) {
          // Standard Cookie-Editor JSON array: [{ name: "SPC_EC", value: "..." }, ...]
          for (const item of parsed) {
            if (item && typeof item === "object" && typeof item.name === "string" && typeof item.value === "string") {
              const name = item.name.trim();
              const value = item.value.trim();
              if (name) {
                cookies[name] = value;
              }
            }
          }
        } else if (typeof parsed === "object" && parsed !== null) {
          // Object map: { "SPC_EC": "...", "SPC_ST": "..." }
          for (const [key, val] of Object.entries(parsed)) {
            if (typeof key === "string" && (typeof val === "string" || typeof val === "number")) {
              const name = key.trim();
              const value = String(val).trim();
              if (name) {
                cookies[name] = value;
              }
            }
          }
        }
      } catch (err) {
        // If JSON parsing failed, fall back to header string parsing below
      }
    }

    // 2. If no cookies parsed yet, parse as raw HTTP Cookie header: key=value; key2=value2
    if (Object.keys(cookies).length === 0) {
      const parts = trimmed.split(";");
      for (const part of parts) {
        const cleanPart = part.trim();
        if (!cleanPart) continue;

        const eqIdx = cleanPart.indexOf("=");
        if (eqIdx > 0) {
          const name = cleanPart.substring(0, eqIdx).trim();
          const value = cleanPart.substring(eqIdx + 1).trim();
          if (name) {
            cookies[name] = value;
          }
        }
      }
    }

    const detectedKeys = Object.keys(cookies);
    if (detectedKeys.length === 0) {
      return {
        valid: false,
        cookies: {},
        cookieHeader: "",
        error: "Unable to parse any cookies from provided input. Please check the format.",
        detectedKeys: [],
      };
    }

    // 3. Verify that at least one essential Shopee auth cookie is present
    const hasAuthCookie = detectedKeys.some((k) =>
      SHOPEE_AUTH_COOKIE_KEYS.includes(k as any) || k.toLowerCase().startsWith("spc_")
    );

    if (!hasAuthCookie) {
      return {
        valid: false,
        cookies,
        cookieHeader: this.toCookieHeader(cookies),
        error: `Input contains cookies, but none of the required Shopee session tokens were found (${SHOPEE_AUTH_COOKIE_KEYS.slice(0, 3).join(", ")}).`,
        detectedKeys,
      };
    }

    return {
      valid: true,
      cookies,
      cookieHeader: this.toCookieHeader(cookies),
      detectedKeys,
    };
  }

  /**
   * Converts cookie key-value map to standard HTTP Cookie header string.
   */
  toCookieHeader(cookies: Record<string, string>): string {
    return Object.entries(cookies)
      .map(([name, val]) => `${name}=${val}`)
      .join("; ");
  }

  /**
   * Encrypts normalized cookies using AES-256-GCM.
   */
  encryptCookies(cookies: Record<string, string>): EncryptedData {
    const serialized = JSON.stringify(cookies);
    return encryptToken(serialized);
  }

  /**
   * Decrypts encrypted cookies back into key-value map.
   */
  decryptCookies(encrypted: EncryptedData): Record<string, string> {
    const serialized = decryptToken(encrypted);
    return JSON.parse(serialized);
  }
}

export const shopeeCookieService = new ShopeeCookieService();
