import crypto from "crypto";

const KEY_LEN = 64;

/**
 * Hashes a plaintext password using crypto.scryptSync with a randomly generated 16-byte salt.
 * Returns formatted string: `${salt}:${hash}` in hex.
 */
export function hashPassword(password: string): string {
  if (!password) {
    throw new Error("Password cannot be empty");
  }
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = crypto.scryptSync(password, salt, KEY_LEN);
  return `${salt}:${derivedKey.toString("hex")}`;
}

/**
 * Verifies a plaintext password against a stored `${salt}:${hash}` string.
 * Uses crypto.timingSafeEqual to defend against timing attacks.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  if (!password || !storedHash) {
    return false;
  }

  const parts = storedHash.split(":");
  if (parts.length !== 2) {
    return false;
  }

  const [salt, expectedHashHex] = parts;
  if (!salt || !expectedHashHex) {
    return false;
  }

  try {
    const derivedKey = crypto.scryptSync(password, salt, KEY_LEN);
    const expectedBuffer = Buffer.from(expectedHashHex, "hex");

    if (derivedKey.length !== expectedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(derivedKey, expectedBuffer);
  } catch {
    return false;
  }
}
