/**
 * Centralized error and log sanitizer to prevent credential / token leaks.
 * Handles sensitive keys independently of token prefix conventions.
 */

const SENSITIVE_KEY_REGEX =
  /^(?:access_token|accesstoken|authorization|bearer|password|secret|client_secret|token|api_key|apikey)$/i;

/**
 * Recursively sanitizes any JavaScript value (objects, arrays, strings, errors).
 * Traverses nested structures and redacts values associated with sensitive keys.
 */
export function sanitizeValue(val: unknown): unknown {
  if (val === null || val === undefined) {
    return val;
  }

  if (typeof val === "string") {
    return sanitizeString(val);
  }

  if (val instanceof Error) {
    return sanitizeErrorMessage(val);
  }

  if (Array.isArray(val)) {
    return val.map((item) => sanitizeValue(item));
  }

  if (typeof val === "object") {
    const sanitizedObj: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(val as Record<string, unknown>)) {
      if (SENSITIVE_KEY_REGEX.test(key)) {
        sanitizedObj[key] = "[REDACTED]";
      } else {
        sanitizedObj[key] = sanitizeValue(value);
      }
    }
    return sanitizedObj;
  }

  return val;
}

/**
 * Sanitizes any string by masking sensitive patterns:
 * - PostgreSQL credentials
 * - Authorization / Bearer headers
 * - Generic access_token, accessToken, secret, password key-value pairs (in JSON, query strings, or headers)
 * Works with arbitrary token prefixes (e.g. THQ, THAA, EA, or custom prefixes).
 */
export function sanitizeString(text: string): string {
  if (!text) return "";
  let sanitized = text;

  // Mask database credentials
  sanitized = sanitized.replace(
    /postgres(?:ql)?:\/\/([^:]+):([^@]+)@/gi,
    "postgresql://$1:***@"
  );

  // Mask Authorization Bearer tokens: "Bearer <token>" or "authorization: Bearer <token>"
  sanitized = sanitized.replace(
    /((?:Bearer|authorization[:=])\s+)([a-zA-Z0-9_\-\.]{8,})/gi,
    "$1[REDACTED]"
  );

  // Mask JSON key-value pairs for sensitive keys: "access_token": "..." or 'accessToken': "..."
  sanitized = sanitized.replace(
    /((?:["']?)(?:access_token|accessToken|authorization|bearer|password|secret|client_secret|token|api_key|apiKey)(?:["']?)\s*:\s*["'])([^"']+)(["'])/gi,
    "$1[REDACTED]$3"
  );

  // Mask query parameters: access_token=... or accessToken=... or client_secret=...
  sanitized = sanitized.replace(
    /((?:access_token|accessToken|token|secret|client_secret|password)=)([^& \s"']+)/gi,
    "$1[REDACTED]"
  );

  // Mask assignment in plain text: access_token=... or password: ...
  sanitized = sanitized.replace(
    /((?:access_token|accessToken|password|secret|client_secret)\s*[=:]\s*["']?)([a-zA-Z0-9_\-\.]{8,})(["']?)/gi,
    "$1[REDACTED]$3"
  );

  return sanitized;
}

/**
 * Extracts a safe error message suitable for client display or logging.
 */
export function sanitizeErrorMessage(
  error: unknown,
  fallbackMessage = "An unexpected error occurred"
): string {
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
 * Safe logger that automatically runs messages and all arguments through recursive sanitization.
 */
export const safeLogger = {
  info: (message: string, ...args: unknown[]) => {
    console.info(sanitizeString(message), ...args.map((a) => sanitizeValue(a)));
  },
  warn: (message: string, ...args: unknown[]) => {
    console.warn(sanitizeString(message), ...args.map((a) => sanitizeValue(a)));
  },
  error: (message: string, error?: unknown) => {
    const safeMsg = sanitizeString(message);
    const safeErr = error ? sanitizeValue(error) : "";
    console.error(safeMsg, safeErr);
  },
};
