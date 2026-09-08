import { beforeAll } from "vitest";
import fs from "fs";
import path from "path";

beforeAll(() => {
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
});
