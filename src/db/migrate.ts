import postgres from "postgres";
import { getEnv } from "@/lib/env";

let schemaPromise: Promise<void> | null = null;
let schemaInitialized = false;

/**
 * Ensures all required tables, constraints, and migrations are applied to the PostgreSQL database.
 * This function is fully idempotent and safe to run on cold starts, application initialization,
 * or migration routes.
 */
export async function ensureDatabaseSchema(client?: postgres.Sql): Promise<void> {
  if (schemaInitialized) {
    return;
  }

  if (schemaPromise) {
    return schemaPromise;
  }

  schemaPromise = (async () => {
    let sql = client;
    let shouldClose = false;

    if (!sql) {
      const env = getEnv();
      sql = postgres(env.DATABASE_URL, { max: 1, connect_timeout: 10 });
      shouldClose = true;
    }

    try {
      // 1. Ensure Drizzle migration schema and table exist
      await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS "drizzle";`);
      await sql.unsafe(`
        CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
          id SERIAL PRIMARY KEY,
          hash text NOT NULL,
          created_at bigint
        );
      `);

      // 2. Ensure threads_accounts table exists
      await sql.unsafe(`
        CREATE TABLE IF NOT EXISTS "threads_accounts" (
          "id" text PRIMARY KEY NOT NULL,
          "threads_user_id" text NOT NULL,
          "username" text NOT NULL,
          "display_name" text NOT NULL,
          "avatar_url" text,
          "biography" text,
          "encrypted_access_token" text NOT NULL,
          "token_iv" text NOT NULL,
          "token_auth_tag" text NOT NULL,
          "status" text DEFAULT 'ACTIVE' NOT NULL,
          "last_checked_at" timestamp with time zone,
          "created_at" timestamp with time zone DEFAULT now() NOT NULL,
          "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
          CONSTRAINT "threads_accounts_threads_user_id_unique" UNIQUE("threads_user_id")
        );
      `);

      // 3. Ensure posts table exists
      await sql.unsafe(`
        CREATE TABLE IF NOT EXISTS "posts" (
          "id" text PRIMARY KEY NOT NULL,
          "account_id" text,
          "text" text NOT NULL,
          "container_id" text,
          "threads_post_id" text,
          "status" text DEFAULT 'PUBLISHING' NOT NULL,
          "error_code" text,
          "error_message" text,
          "created_at" timestamp with time zone DEFAULT now() NOT NULL,
          "published_at" timestamp with time zone
        );
      `);

      // 4. Ensure snapshot columns and foreign key on posts (Migration 0001 upgrade)
      await sql.unsafe(`
        ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "account_threads_user_id" text;
        ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "account_username" text;
        ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "account_display_name" text;
      `);

      // Backfill snapshot data if posts existed prior to 0001
      await sql.unsafe(`
        UPDATE "posts" p
        SET
          "account_threads_user_id" = COALESCE(p."account_threads_user_id", a."threads_user_id", 'unknown'),
          "account_username"        = COALESCE(p."account_username", a."username", 'unknown'),
          "account_display_name"    = COALESCE(p."account_display_name", a."display_name", 'unknown')
        FROM "threads_accounts" a
        WHERE p."account_id" = a."id"
          AND p."account_threads_user_id" IS NULL;

        UPDATE "posts" SET "account_threads_user_id" = 'unknown' WHERE "account_threads_user_id" IS NULL;
        UPDATE "posts" SET "account_username" = 'unknown' WHERE "account_username" IS NULL;
        UPDATE "posts" SET "account_display_name" = 'unknown' WHERE "account_display_name" IS NULL;

        ALTER TABLE "posts" ALTER COLUMN "account_threads_user_id" SET NOT NULL;
        ALTER TABLE "posts" ALTER COLUMN "account_username" SET NOT NULL;
        ALTER TABLE "posts" ALTER COLUMN "account_display_name" SET NOT NULL;
      `);

      // 5. Ensure FK constraint with ON DELETE SET NULL
      await sql.unsafe(`
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'posts_account_id_threads_accounts_id_fk'
          ) THEN
            ALTER TABLE "posts" ADD CONSTRAINT "posts_account_id_threads_accounts_id_fk"
              FOREIGN KEY ("account_id") REFERENCES "public"."threads_accounts"("id")
              ON DELETE SET NULL ON UPDATE NO ACTION;
          END IF;
        END $$;
      `);

      // 6. Record migrations in drizzle tracking table
      await sql.unsafe(`
        INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at")
        SELECT '0000_talented_adam_destine', 1788851104191
        WHERE NOT EXISTS (
          SELECT 1 FROM "drizzle"."__drizzle_migrations" WHERE "created_at" = 1788851104191
        );

        INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at")
        SELECT '0001_lazy_dagger', 1788859429750
        WHERE NOT EXISTS (
          SELECT 1 FROM "drizzle"."__drizzle_migrations" WHERE "created_at" = 1788859429750
        );
      `);

      schemaInitialized = true;
    } finally {
      if (shouldClose && sql) {
        await sql.end();
      }
    }
  })().catch((err) => {
    schemaPromise = null;
    throw err;
  });

  return schemaPromise;
}
