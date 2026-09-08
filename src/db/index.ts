import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { getEnv } from "@/lib/env";

declare global {
  // eslint-disable-next-line no-var
  var _postgresClient: ReturnType<typeof postgres> | undefined;
}

function getDatabaseClient() {
  const env = getEnv();
  const connectionString = env.DATABASE_URL;

  // In development, preserve client across hot module reloads
  if (process.env.NODE_ENV === "development") {
    if (!global._postgresClient) {
      global._postgresClient = postgres(connectionString, { max: 10 });
    }
    return global._postgresClient;
  }

  // Serverless / production configuration
  return postgres(connectionString, { max: 10, idle_timeout: 20 });
}

export const db = drizzle(getDatabaseClient(), { schema });
