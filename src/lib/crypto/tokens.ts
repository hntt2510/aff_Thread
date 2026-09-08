import crypto from "crypto";
import { getEnv } from "@/lib/env";

export interface EncryptedData {
  ciphertext: string;
  iv: string;
  authTag: string;
}

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12; // Recommended IV length for GCM

function getEncryptionKey(): Buffer {
  const env = getEnv();
  const keyHex = env.THREADS_TOKEN_ENCRYPTION_KEY;
  if (!keyHex || keyHex.length !== 64) {
    throw new Error("Invalid THREADS_TOKEN_ENCRYPTION_KEY: must be a 64-character hex string (32 bytes)");
  }
  return Buffer.from(keyHex, "hex");
}

/**
 * Encrypts a plaintext string (e.g. Threads access token) using AES-256-GCM.
 * Returns { ciphertext, iv, authTag } in hex representation.
 */
export function encryptToken(plainToken: string, overrideKey?: Buffer): EncryptedData {
  if (!plainToken) {
    throw new Error("Cannot encrypt empty token");
  }

  const key = overrideKey || getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let ciphertext = cipher.update(plainToken, "utf8", "hex");
  ciphertext += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return {
    ciphertext,
    iv: iv.toString("hex"),
    authTag,
  };
}

/**
 * Decrypts an AES-256-GCM encrypted token.
 * Throws an error if data is tampered, corrupted, or key is incorrect.
 */
export function decryptToken(encrypted: EncryptedData, overrideKey?: Buffer): string {
  if (!encrypted.ciphertext || !encrypted.iv || !encrypted.authTag) {
    throw new Error("Malformed encrypted token data");
  }

  const key = overrideKey || getEncryptionKey();
  const iv = Buffer.from(encrypted.iv, "hex");
  const authTag = Buffer.from(encrypted.authTag, "hex");

  if (iv.length !== IV_LENGTH_BYTES) {
    throw new Error("Invalid IV length for AES-GCM");
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted.ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
