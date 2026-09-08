/**
 * P3 — Migration Regression Integration Test
 *
 * Proves that migration 0001 correctly handles existing data:
 * 1. Applies migration 0000 (baseline schema)
 * 2. Inserts one Threads account + one historical post referencing that account
 * 3. Applies migration 0001 (adds snapshot columns, changes FK)
 * 4. Asserts post still exists, text unchanged, snapshot fields backfilled
 * 5. Deletes account, asserts post survives with account_id = NULL and snapshots intact
 *
 * Requires: real PostgreSQL 16. Uses DATABASE_URL from environment (CI sets it).
 * Skips gracefully when DATABASE_URL is not available.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import postgres from "postgres";
import path from "path";
import fs from "fs";

// ─── helpers ─────────────────────────────────────────────────────────────────

function readMigration(filename: string): string {
  const fullPath = path.resolve(
    process.cwd(),
    "src/db/migrations",
    filename
  );
  return fs.readFileSync(fullPath, "utf8");
}

/**
 * Split a Drizzle-generated SQL file on --> statement-breakpoint markers and
 * execute each statement individually so we can control transaction boundaries.
 */
async function applyMigration(sql: postgres.Sql, content: string): Promise<void> {
  // Drizzle uses `--> statement-breakpoint` as a delimiter between statements.
  // Strip the delimiter text and split on it.
  const statements = content
    .split(/--> statement-breakpoint/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"));

  for (const stmt of statements) {
    await sql.unsafe(stmt);
  }
}

// ─── test isolation: unique schema per test run ───────────────────────────────

const TEST_SCHEMA = `migration_regression_${Date.now()}`;
const HAS_DB = Boolean(process.env.DATABASE_URL);

// ─── suite ───────────────────────────────────────────────────────────────────

describe.skipIf(!HAS_DB)(
  "Migration 0001 regression (real PostgreSQL)",
  () => {
    const databaseUrl = process.env.DATABASE_URL!;
    let sql: postgres.Sql;

    beforeAll(async () => {
      sql = postgres(databaseUrl, { max: 1 });
      // Create an isolated schema so we don't interfere with other test tables
      await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS "${TEST_SCHEMA}"`);
    });

    afterAll(async () => {
      try {
        await sql.unsafe(`DROP SCHEMA IF EXISTS "${TEST_SCHEMA}" CASCADE`);
      } finally {
        await sql.end();
      }
    });

    it("Step 1: applies migration 0000 baseline schema successfully", async () => {
      const migration0 = readMigration("0000_talented_adam_destine.sql");
      // Redirect "public" schema references to our isolated test schema
      const adapted = migration0.replace(/\"public\"\./g, `"${TEST_SCHEMA}".`);
      await applyMigration(sql, adapted);

      // Verify tables exist
      const tables = await sql<{ tablename: string }[]>`
        SELECT tablename FROM pg_tables
        WHERE schemaname = ${TEST_SCHEMA}
        ORDER BY tablename
      `;
      const names = tables.map((t) => t.tablename).sort();
      expect(names).toContain("threads_accounts");
      expect(names).toContain("posts");
    });

    it("Step 2: inserts a Threads account and a historical post", async () => {
      // Insert account
      await sql.unsafe(`
        INSERT INTO "${TEST_SCHEMA}".threads_accounts (
          id, threads_user_id, username, display_name,
          encrypted_access_token, token_iv, token_auth_tag,
          status, created_at, updated_at
        ) VALUES (
          'acc-test-001', 'threads-uid-001', 'migration_tester', 'Migration Tester',
          'enc-token', 'iv-value', 'auth-tag-value',
          'ACTIVE', NOW(), NOW()
        )
      `);

      // Insert post referencing that account (pre-migration schema has account_id NOT NULL)
      await sql.unsafe(`
        INSERT INTO "${TEST_SCHEMA}".posts (
          id, account_id, text, status, created_at
        ) VALUES (
          'post-test-001', 'acc-test-001',
          'Historical post content — must survive migration',
          'PUBLISHED', NOW()
        )
      `);

      // Confirm insertion
      const [post] = await sql<{ id: string; text: string; account_id: string }[]>`
        SELECT id, text, account_id FROM "${sql(TEST_SCHEMA)}".posts WHERE id = 'post-test-001'
      `;
      expect(post).toBeDefined();
      expect(post.text).toBe("Historical post content — must survive migration");
      expect(post.account_id).toBe("acc-test-001");
    });

    it("Step 3: applies migration 0001 without errors (safe for existing data)", async () => {
      const migration1 = readMigration("0001_lazy_dagger.sql");

      // Adapt schema references: Drizzle-generated SQL targets "public" schema
      const adapted = migration1
        .replace(/\"public\"\./g, `"${TEST_SCHEMA}".`)
        .replace(/REFERENCES "public"\./g, `REFERENCES "${TEST_SCHEMA}".`)
        .replace(/FROM "threads_accounts"/g, `FROM "${TEST_SCHEMA}"."threads_accounts"`)
        .replace(/JOIN "threads_accounts"/g, `JOIN "${TEST_SCHEMA}"."threads_accounts"`)
        .replace(/UPDATE "posts" p/g, `UPDATE "${TEST_SCHEMA}"."posts" p`);

      // Should not throw — the migration safely backfills existing rows
      await expect(applyMigration(sql, adapted)).resolves.not.toThrow();
    });

    it("Step 4: post still exists, text unchanged, snapshot fields are backfilled", async () => {
      const [post] = await sql<{
        id: string;
        text: string;
        account_id: string | null;
        account_threads_user_id: string;
        account_username: string;
        account_display_name: string;
      }[]>`
        SELECT id, text, account_id, account_threads_user_id, account_username, account_display_name
        FROM "${sql(TEST_SCHEMA)}".posts
        WHERE id = 'post-test-001'
      `;

      expect(post).toBeDefined();
      expect(post.text).toBe("Historical post content — must survive migration");
      expect(post.account_id).toBe("acc-test-001");

      // Snapshot columns must be backfilled from threads_accounts JOIN
      expect(post.account_threads_user_id).toBe("threads-uid-001");
      expect(post.account_username).toBe("migration_tester");
      expect(post.account_display_name).toBe("Migration Tester");
    });

    it("Step 5: deleting account sets account_id NULL but post and snapshots survive", async () => {
      // Delete the account — FK is now ON DELETE SET NULL
      await sql.unsafe(`
        DELETE FROM "${TEST_SCHEMA}".threads_accounts WHERE id = 'acc-test-001'
      `);

      const [post] = await sql<{
        id: string;
        text: string;
        account_id: string | null;
        account_threads_user_id: string;
        account_username: string;
        account_display_name: string;
      }[]>`
        SELECT id, text, account_id, account_threads_user_id, account_username, account_display_name
        FROM "${sql(TEST_SCHEMA)}".posts
        WHERE id = 'post-test-001'
      `;

      expect(post).toBeDefined();
      // Post survives
      expect(post.text).toBe("Historical post content — must survive migration");
      // account_id is NULL (account deleted)
      expect(post.account_id).toBeNull();
      // Snapshot fields are immutable — they must still have the original values
      expect(post.account_threads_user_id).toBe("threads-uid-001");
      expect(post.account_username).toBe("migration_tester");
      expect(post.account_display_name).toBe("Migration Tester");
    });
  }
);
