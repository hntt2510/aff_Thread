import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db } from "@/db";

/**
 * Migration runner executing committed Drizzle migrations.
 * Committed Drizzle migrations in src/db/migrations are the single source of truth.
 *
 * Production rule:
 * - No CREATE TABLE / ALTER TABLE at application runtime.
 * - No startup DDL.
 * - No request-path DDL.
 * - Schema migrations are executed via `npm run db:migrate` or this utility.
 */
export async function ensureDatabaseSchema(): Promise<void> {
  await migrate(db, { migrationsFolder: "./src/db/migrations" });
}

export async function runDatabaseMigrations(): Promise<void> {
  await ensureDatabaseSchema();
}
