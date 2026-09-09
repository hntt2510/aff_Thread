import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { getEnv } from "@/lib/env";

declare global {
  // eslint-disable-next-line no-var
  var _postgresClient: ReturnType<typeof postgres> | undefined;
  // eslint-disable-next-line no-var
  var _drizzleDb: ReturnType<typeof drizzle<typeof schema>> | undefined;
}

export function getDatabaseClient() {
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

function getDbInstance() {
  if (process.env.NODE_ENV === "development") {
    if (!global._drizzleDb) {
      global._drizzleDb = drizzle(getDatabaseClient(), { schema });
    }
    return global._drizzleDb;
  }
  if (!global._drizzleDb) {
    global._drizzleDb = drizzle(getDatabaseClient(), { schema });
  }
  return global._drizzleDb;
}

// Lazy Proxy: prevents evaluating getEnv() or establishing connection at build/module evaluation time.
// Database connection and environment validation only happen when a query is actually performed at runtime.
export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, prop) {
    const instance = getDbInstance();
    const val = (instance as unknown as Record<string | symbol, unknown>)[prop];
    return typeof val === "function" ? val.bind(instance) : val;
  },
});
