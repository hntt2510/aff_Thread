#!/usr/bin/env node
import crypto from "crypto";

const password = process.argv[2];
if (!password) {
  console.error("Usage: node scripts/hash-password.mjs <your_password>");
  process.exit(1);
}

const salt = crypto.randomBytes(16).toString("hex");
const derivedKey = crypto.scryptSync(password, salt, 64);
const hashString = `${salt}:${derivedKey.toString("hex")}`;

console.log("\nGenerated ADMIN_PASSWORD_HASH:");
console.log(hashString);
console.log("\nSet this in your .env.local or production environment:\nADMIN_PASSWORD_HASH=" + hashString + "\n");
