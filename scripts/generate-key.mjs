#!/usr/bin/env node
import crypto from "crypto";

const sessionSecret = crypto.randomBytes(32).toString("hex");
const encryptionKey = crypto.randomBytes(32).toString("hex");

console.log("SESSION_SECRET=" + sessionSecret);
console.log("THREADS_TOKEN_ENCRYPTION_KEY=" + encryptionKey);
