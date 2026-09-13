import fs from "fs";
import path from "path";

// Load .env.local immediately at module evaluation so it's available during test imports
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  if (typeof process.loadEnvFile === "function") {
    process.loadEnvFile(envPath);
  } else {
    const content = fs.readFileSync(envPath, "utf8");
    content.split("\n").forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const [key, ...valParts] = trimmed.split("=");
        if (key && valParts.length > 0) {
          process.env[key.trim()] = valParts.join("=").trim();
        }
      }
    });
  }
}

// STRICT TEST ISOLATION GUARD:
// Never allow automated unit or integration tests to mutate the live development/production DATABASE_URL.
// Tests that require a real database must explicitly configure TEST_DATABASE_URL.
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
} else {
  // Overwrite DATABASE_URL with a dummy non-routable connection string so tests never touch real dev/production databases.
  process.env.DATABASE_URL = "postgresql://test_isolated:test_isolated@127.0.0.1:54321/test_isolated_db";
}
