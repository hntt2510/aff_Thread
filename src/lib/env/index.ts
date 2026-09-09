import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  ADMIN_USERNAME: z
    .string()
    .optional()
    .transform((val) => (val && val.trim().length > 0 ? val.trim() : "admin")),
  ADMIN_PASSWORD_HASH: z
    .string({ required_error: "ADMIN_PASSWORD_HASH is required" })
    .transform((val) => val.trim())
    .refine((val) => val.length > 0, "ADMIN_PASSWORD_HASH is required"),
  SESSION_SECRET: z
    .string({ required_error: "SESSION_SECRET is required" })
    .transform((val) => val.trim())
    .refine((val) => val.length >= 32, "SESSION_SECRET must be at least 32 characters"),
  THREADS_TOKEN_ENCRYPTION_KEY: z
    .string({ required_error: "THREADS_TOKEN_ENCRYPTION_KEY is required" })
    .transform((val) => val.trim())
    .refine(
      (val) => /^[0-9a-fA-F]{64}$/.test(val),
      "THREADS_TOKEN_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)"
    ),
  DATABASE_URL: z
    .string({ required_error: "DATABASE_URL is required" })
    .transform((val) => val.trim())
    .refine((val) => val.length > 0, "DATABASE_URL is required"),
  CRON_SECRET: z
    .string()
    .optional()
    .transform((val) => (val && val.trim().length > 0 ? val.trim() : undefined)),
  CLOUDINARY_CLOUD_NAME: z
    .string()
    .optional()
    .transform((val) => (val && val.trim().length > 0 ? val.trim() : undefined)),
  CLOUDINARY_API_KEY: z
    .string()
    .optional()
    .transform((val) => (val && val.trim().length > 0 ? val.trim() : undefined)),
  CLOUDINARY_API_SECRET: z
    .string()
    .optional()
    .transform((val) => (val && val.trim().length > 0 ? val.trim() : undefined)),
});

let cachedEnv: z.infer<typeof envSchema> | null = null;

export function getEnv() {
  if (cachedEnv) {
    return cachedEnv;
  }

  // Ensure this is only called server-side
  if (typeof window !== "undefined") {
    throw new Error("Server environment variables cannot be accessed on the client");
  }

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errorDetails = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join(", ");
    throw new Error(`Environment validation failed: ${errorDetails}`);
  }

  cachedEnv = result.data;
  return cachedEnv;
}

// Reset cached env (useful for tests)
export function resetEnvCache() {
  cachedEnv = null;
}
