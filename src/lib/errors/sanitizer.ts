/**
 * Centralized error and log sanitizer to prevent credential / token leaks.
 */

// Patterns that might look like access tokens, auth headers, passwords, or connection strings
const SENSITIVE_PATTERNS = [
  /(?:access_token|token|secret|password|key|authorization|bearer)[=:\s]+["']?([a-zA-Z0-9_\-\.]{8,})["']?/gi,
  /postgres(?:ql)?:\/\/[^@]+@/gi,
  /THQ[a-zA-Z0-9_\-]+/g, // Threads token prefixes if any
  /EA[a-zA-Z0-9_\-]+/g, // Meta access token common prefix (EA...)
];

/**
 * Sanitizes any string by masking sensitive patterns (tokens, passwords, DB URIs).
 */
export function sanitizeString(text: string): string {
  if (!text) return "";
  let sanitized = text;

  // Mask database credentials
  sanitized = sanitized.replace(/postgres(?:ql)?:\/\/([^:]+):([^@]+)@/gi, "postgresql://$1:***@");

  // Mask Meta access tokens
  sanitized = sanitized.replace(/EA[A-Za-z0-9_\-]{20,}/g, "[REDACTED_META_TOKEN]");
  sanitized = sanitized.replace(/THQ[A-Za-z0-9_\-]{20,}/g, "[REDACTED_TOKEN]");

  // Mask general token query params or json fields
  sanitized = sanitized.replace(/(access_token=)[^& \s"']+/gi, "$1[REDACTED]");
  sanitized = sanitized.replace(/(["']?access_token["']?\s*:\s*["'])[^"']+["']/gi, '$1[REDACTED]"');

  return sanitized;
}

/**
 * Extracts a safe error message suitable for client display or logging.
 */
export function sanitizeErrorMessage(error: unknown, fallbackMessage = "An unexpected error occurred"): string {
  if (!error) return fallbackMessage;

  let rawMessage = fallbackMessage;
  if (typeof error === "string") {
    rawMessage = error;
  } else if (error instanceof Error) {
    rawMessage = error.message;
  } else if (typeof error === "object" && error !== null && "message" in error) {
    rawMessage = String((error as { message: unknown }).message);
  }

  return sanitizeString(rawMessage);
}

/**
 * Safe logger that automatically runs strings through the sanitizer.
 */
export const safeLogger = {
  info: (message: string, ...args: unknown[]) => {
    console.info(sanitizeString(message), ...args.map((a) => (typeof a === "string" ? sanitizeString(a) : a)));
  },
  warn: (message: string, ...args: unknown[]) => {
    console.warn(sanitizeString(message), ...args.map((a) => (typeof a === "string" ? sanitizeString(a) : a)));
  },
  error: (message: string, error?: unknown) => {
    const safeMsg = sanitizeString(message);
    const safeErr = error ? sanitizeErrorMessage(error) : "";
    console.error(safeMsg, safeErr);
  },
};
