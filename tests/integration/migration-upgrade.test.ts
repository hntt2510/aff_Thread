/**
 * P3 — Migration Regression Integration Test
 *
 * Proves that migration 0001 correctly handles existing data:
 * 1. Applies migration 0000 (baseline schema)
 * 2. Inserts one Threads account + one historical post referencing that account
 * 3. Applies migration 0001 (adds snapshot columns, changes FK)
 * 4. Assert:
 *    - post still exists
 *    - text unchanged
 *    - snapshot fields backfilled from threads_accounts
 *    - account_id is still associated before account deletion
 * 5. Delete account:
 *    - post STILL exists
 *    - account_id becomes NULL (ON DELETE SET NULL)
 *    - snapshot fields remain intact (accountThreadsUserId, accountUsername, accountDisplayName)
 *
 * Requires: real PostgreSQL 16 (provided by CI service).
 * In local environment without a running PostgreSQL container, skips gracefully.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import postgres from "postgres";
import path from "path";
import fs from "fs";

// ─── helpers ─────────────────────────────────────────────────────────────────

function readMigration(filename: string): string {
  const fullPath = path.resolve(process.cwd(), "src/db/migrations", filename);
  return fs.readFileSync(fullPath, "utf8");
}

function adaptSql(content: string, schema: string): string {
  return content
    .replace(/"public"\./g, `"${schema}".`)
    .replace(/CREATE TABLE "posts"/g, `CREATE TABLE "${schema}"."posts"`)
    .replace(/CREATE TABLE "threads_accounts"/g, `CREATE TABLE "${schema}"."threads_accounts"`)
    .replace(/ALTER TABLE "posts"/g, `ALTER TABLE "${schema}"."posts"`)
    .replace(/UPDATE "posts"/g, `UPDATE "${schema}"."posts"`)
    .replace(/FROM "threads_accounts"/g, `FROM "${schema}"."threads_accounts"`);
}

async function applyMigration(sql: postgres.Sql, content: string): Promise<void> {
  const statements = content
    .split(/--> statement-breakpoint/g)
    .map((s) => {
      // Strip line comments from each statement
      return s
        .split("\n")
        .map((line) => line.replace(/--.*$/, "").trim())
        .filter((line) => line.length > 0)
        .join("\n")
        .trim();
    })
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    await sql.unsafe(stmt);
  }
}

// ─── check DB reachability ───────────────────────────────────────────────────

const databaseUrl = process.env.DATABASE_URL;
let isDbReachable = false;

if (databaseUrl) {
  try {
    const probe = postgres(databaseUrl, { max: 1, connect_timeout: 2 });
    await probe`SELECT 1`;
    await probe.end();
    isDbReachable = true;
  } catch {
    isDbReachable = false;
  }
}

const TEST_SCHEMA = `migration_regression_${Date.now()}`;

// ─── suite ───────────────────────────────────────────────────────────────────

describe.skipIf(!isDbReachable)(
  "Migration 0001 regression (real PostgreSQL)",
  () => {
    let sql: postgres.Sql;

    beforeAll(async () => {
      sql = postgres(databaseUrl!, { max: 1 });
      await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS "${TEST_SCHEMA}"`);
    });

    afterAll(async () => {
      try {
        if (sql) {
          await sql.unsafe(`DROP SCHEMA IF EXISTS "${TEST_SCHEMA}" CASCADE`);
          await sql.end();
        }
      } catch {
        // cleanup best-effort
      }
    });

    it("Step 1: applies migration 0000 baseline schema successfully", async () => {
      const migration0 = readMigration("0000_talented_adam_destine.sql");
      const adapted = adaptSql(migration0, TEST_SCHEMA);
      await applyMigration(sql, adapted);

      const tables = await sql.unsafe<{ tablename: string }[]>(`
        SELECT tablename FROM pg_tables
        WHERE schemaname = '${TEST_SCHEMA}'
        ORDER BY tablename
      `);
      const names = tables.map((t) => t.tablename).sort();
      expect(names).toContain("threads_accounts");
      expect(names).toContain("posts");
    });

    it("Step 2: inserts a Threads account and a historical post referencing it", async () => {
      await sql.unsafe(`
        INSERT INTO "${TEST_SCHEMA}"."threads_accounts" (
          id, threads_user_id, username, display_name,
          encrypted_access_token, token_iv, token_auth_tag,
          status, created_at, updated_at
        ) VALUES (
          'acc-test-001', 'threads-uid-001', 'migration_tester', 'Migration Tester',
          'enc-token', 'iv-value', 'auth-tag-value',
          'ACTIVE', NOW(), NOW()
        )
      `);

      await sql.unsafe(`
        INSERT INTO "${TEST_SCHEMA}"."posts" (
          id, account_id, text, status, created_at
        ) VALUES (
          'post-test-001', 'acc-test-001',
          'Historical post content — must survive migration',
          'PUBLISHED', NOW()
        )
      `);

      const [post] = await sql.unsafe<{ id: string; text: string; account_id: string }[]>(`
        SELECT id, text, account_id FROM "${TEST_SCHEMA}"."posts" WHERE id = 'post-test-001'
      `);
      expect(post).toBeDefined();
      expect(post.text).toBe("Historical post content — must survive migration");
      expect(post.account_id).toBe("acc-test-001");
    });

    it("Step 3: applies migration 0001 without errors (safe for existing data)", async () => {
      const migration1 = readMigration("0001_lazy_dagger.sql");
      const adapted = adaptSql(migration1, TEST_SCHEMA);

      // Must not throw on database with pre-existing posts
      await expect(applyMigration(sql, adapted)).resolves.not.toThrow();
    });

    it("Step 4: post still exists, text unchanged, snapshot fields are backfilled", async () => {
      const [post] = await sql.unsafe<{
        id: string;
        text: string;
        account_id: string | null;
        account_threads_user_id: string;
        account_username: string;
        account_display_name: string;
      }[]>(`
        SELECT id, text, account_id, account_threads_user_id, account_username, account_display_name
        FROM "${TEST_SCHEMA}"."posts"
        WHERE id = 'post-test-001'
      `);

      expect(post).toBeDefined();
      expect(post.text).toBe("Historical post content — must survive migration");
      expect(post.account_id).toBe("acc-test-001");

      // Snapshot columns must be backfilled from threads_accounts JOIN
      expect(post.account_threads_user_id).toBe("threads-uid-001");
      expect(post.account_username).toBe("migration_tester");
      expect(post.account_display_name).toBe("Migration Tester");
    });

    it("Step 5: deleting account sets account_id NULL but post and snapshots survive", async () => {
      await sql.unsafe(`
        DELETE FROM "${TEST_SCHEMA}"."threads_accounts" WHERE id = 'acc-test-001'
      `);

      const [post] = await sql.unsafe<{
        id: string;
        text: string;
        account_id: string | null;
        account_threads_user_id: string;
        account_username: string;
        account_display_name: string;
      }[]>(`
        SELECT id, text, account_id, account_threads_user_id, account_username, account_display_name
        FROM "${TEST_SCHEMA}"."posts"
        WHERE id = 'post-test-001'
      `);

      expect(post).toBeDefined();
      // Post survives
      expect(post.text).toBe("Historical post content — must survive migration");
      // account_id becomes NULL (ON DELETE SET NULL)
      expect(post.account_id).toBeNull();
      // Snapshot fields are immutable and intact
      expect(post.account_threads_user_id).toBe("threads-uid-001");
      expect(post.account_username).toBe("migration_tester");
      expect(post.account_display_name).toBe("Migration Tester");
    });
  }
);
