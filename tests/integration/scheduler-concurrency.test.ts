import { describe, it, expect, beforeAll, afterAll } from "vitest";
import postgres from "postgres";

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

const TEST_SCHEMA = `scheduler_test_${Date.now()}`;

describe.skipIf(!isDbReachable)(
  "Scheduler Atomic Claim & Concurrency Protection (PostgreSQL)",
  () => {
    let sql: postgres.Sql;

    beforeAll(async () => {
      sql = postgres(databaseUrl!, { max: 5 });
      await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS "${TEST_SCHEMA}"`);

      // Create schema in test namespace
      await sql.unsafe(`
        CREATE TABLE "${TEST_SCHEMA}"."threads_accounts" (
          id text PRIMARY KEY NOT NULL,
          threads_user_id text NOT NULL UNIQUE,
          username text NOT NULL,
          display_name text NOT NULL,
          encrypted_access_token text NOT NULL,
          token_iv text NOT NULL,
          token_auth_tag text NOT NULL,
          status text DEFAULT 'ACTIVE' NOT NULL,
          created_at timestamp with time zone DEFAULT now() NOT NULL,
          updated_at timestamp with time zone DEFAULT now() NOT NULL
        );

        CREATE TABLE "${TEST_SCHEMA}"."posts" (
          id text PRIMARY KEY NOT NULL,
          account_id text REFERENCES "${TEST_SCHEMA}"."threads_accounts"(id) ON DELETE SET NULL,
          account_threads_user_id text NOT NULL,
          account_username text NOT NULL,
          account_display_name text NOT NULL,
          text text NOT NULL,
          container_id text,
          threads_post_id text,
          status text DEFAULT 'PUBLISHING' NOT NULL,
          error_code text,
          error_message text,
          scheduled_at timestamp with time zone,
          failed_at timestamp with time zone,
          cancelled_at timestamp with time zone,
          publish_attempts integer DEFAULT 0 NOT NULL,
          last_attempt_at timestamp with time zone,
          last_error text,
          created_at timestamp with time zone DEFAULT now() NOT NULL,
          published_at timestamp with time zone,
          updated_at timestamp with time zone DEFAULT now() NOT NULL
        );

        CREATE INDEX "posts_scheduled_due_idx" ON "${TEST_SCHEMA}"."posts" (status, scheduled_at) WHERE status = 'SCHEDULED';
      `);

      // Seed test account
      await sql.unsafe(`
        INSERT INTO "${TEST_SCHEMA}"."threads_accounts" (
          id, threads_user_id, username, display_name,
          encrypted_access_token, token_iv, token_auth_tag
        ) VALUES (
          'acc-conc-001', 'uid-conc-001', 'concurrency_tester', 'Concurrency Tester',
          'enc-token', 'iv', 'tag'
        );
      `);
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

    it("claims due posts atomically and skips locked rows under concurrent worker race", async () => {
      // 1. Seed 1 due post, 1 future post, 1 cancelled post
      const dueId = "post-due-001";
      const futureId = "post-future-002";
      const cancelledId = "post-cancelled-003";

      await sql.unsafe(`
        INSERT INTO "${TEST_SCHEMA}"."posts" (
          id, account_id, account_threads_user_id, account_username, account_display_name,
          text, status, scheduled_at, publish_attempts
        ) VALUES
        (
          '${dueId}', 'acc-conc-001', 'uid-conc-001', 'concurrency_tester', 'Concurrency Tester',
          'Due post ready to publish', 'SCHEDULED', NOW() - INTERVAL '1 minute', 0
        ),
        (
          '${futureId}', 'acc-conc-001', 'uid-conc-001', 'concurrency_tester', 'Concurrency Tester',
          'Future post not yet due', 'SCHEDULED', NOW() + INTERVAL '1 hour', 0
        ),
        (
          '${cancelledId}', 'acc-conc-001', 'uid-conc-001', 'concurrency_tester', 'Concurrency Tester',
          'Cancelled post', 'CANCELLED', NOW() - INTERVAL '5 minutes', 0
        );
      `);

      // Function simulating a worker claiming due posts using the exact production atomic query
      const claimWorker = async () => {
        return sql.unsafe<{ id: string; status: string; publish_attempts: number }[]>(`
          UPDATE "${TEST_SCHEMA}"."posts"
          SET
            status = 'PUBLISHING',
            publish_attempts = publish_attempts + 1,
            last_attempt_at = NOW(),
            updated_at = NOW()
          WHERE id IN (
            SELECT id
            FROM "${TEST_SCHEMA}"."posts"
            WHERE status = 'SCHEDULED'
              AND scheduled_at <= NOW()
            ORDER BY scheduled_at ASC
            LIMIT 10
            FOR UPDATE SKIP LOCKED
          )
          RETURNING id, status, publish_attempts;
        `);
      };

      // 2. Race two concurrent workers simultaneously against the database
      const [worker1Result, worker2Result] = await Promise.all([
        claimWorker(),
        claimWorker(),
      ]);

      const totalClaimed = worker1Result.length + worker2Result.length;
      expect(totalClaimed).toBe(1); // Exactly ONE worker must claim the due post

      const claimedByWorker1 = worker1Result.some((p) => p.id === dueId);
      const claimedByWorker2 = worker2Result.some((p) => p.id === dueId);

      expect(claimedByWorker1 !== claimedByWorker2).toBe(true); // Either worker 1 OR worker 2, never both

      // 3. Verify future and cancelled posts were NOT claimed
      const [futurePost] = await sql.unsafe<{ status: string; publish_attempts: number }[]>(`
        SELECT status, publish_attempts FROM "${TEST_SCHEMA}"."posts" WHERE id = '${futureId}'
      `);
      expect(futurePost.status).toBe("SCHEDULED");
      expect(futurePost.publish_attempts).toBe(0);

      const [cancelledPost] = await sql.unsafe<{ status: string }[]>(`
        SELECT status FROM "${TEST_SCHEMA}"."posts" WHERE id = '${cancelledId}'
      `);
      expect(cancelledPost.status).toBe("CANCELLED");

      // 4. Verify claimed due post in database is now PUBLISHING with attempts = 1
      const [duePostDb] = await sql.unsafe<{ status: string; publish_attempts: number }[]>(`
        SELECT status, publish_attempts FROM "${TEST_SCHEMA}"."posts" WHERE id = '${dueId}'
      `);
      expect(duePostDb.status).toBe("PUBLISHING");
      expect(duePostDb.publish_attempts).toBe(1);
    });
  }
);
