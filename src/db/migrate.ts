import { db } from "@/db";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import fs from "node:fs";
import path from "node:path";
import { BUNDLED_MIGRATIONS } from "./migrations-bundle";

export interface SchemaInspectionResult {
  appliedMigrations: Array<{ id: number; hash: string; created_at: string }>;
  is0003Applied: boolean;
  is0004Applied: boolean;
  schemaObjects: {
    postsMediaType: boolean;
    postsProcessingStatus: boolean;
    postMediaTable: boolean;
    postMediaAssetIdColumn: boolean;
    mediaAssetsTable: boolean;
    affiliateCampaignsTable: boolean;
    affiliateLinksTable: boolean;
    postAffiliateLinksTable: boolean;
    affiliateClicksTable: boolean;
    schedulerRunsTable: boolean;
  };
  allObjectsExist: boolean;
}

/**
 * Inspects the current database schema objects and migration state.
 * Safe, read-only inspection query.
 */
export async function inspectDatabaseSchema(): Promise<SchemaInspectionResult> {
  // 1. Inspect applied migrations from drizzle.__drizzle_migrations
  let appliedMigrations: Array<{ id: number; hash: string; created_at: string }> = [];
  try {
    const rows = await db.execute(
      sql`SELECT id, hash, created_at FROM "drizzle"."__drizzle_migrations" ORDER BY created_at ASC`
    );
    appliedMigrations = (rows as unknown as Array<{ id: number; hash: string; created_at: string }>).map((r) => ({
      id: Number(r.id),
      hash: String(r.hash),
      created_at: String(r.created_at),
    }));
  } catch {
    // Migration table may not exist yet if fresh database
    appliedMigrations = [];
  }

  // 2. Inspect posts columns (media_type, processing_status)
  let postsColumns: string[] = [];
  try {
    const colRows = await db.execute(
      sql`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'posts' AND column_name IN ('media_type', 'processing_status')`
    );
    postsColumns = (colRows as unknown as Array<{ column_name: string }>).map((r) => r.column_name);
  } catch {
    postsColumns = [];
  }

  // 3. Inspect post_media columns (media_asset_id)
  let postMediaColumns: string[] = [];
  try {
    const pmColRows = await db.execute(
      sql`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'post_media' AND column_name = 'media_asset_id'`
    );
    postMediaColumns = (pmColRows as unknown as Array<{ column_name: string }>).map((r) => r.column_name);
  } catch {
    postMediaColumns = [];
  }

  // 4. Inspect target tables (post_media, media_assets, affiliate_campaigns, affiliate_links, post_affiliate_links, affiliate_clicks, scheduler_runs)
  let existingTables: string[] = [];
  try {
    const tableRows = await db.execute(
      sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('post_media', 'media_assets', 'affiliate_campaigns', 'affiliate_links', 'post_affiliate_links', 'affiliate_clicks', 'scheduler_runs')`
    );
    existingTables = (tableRows as unknown as Array<{ table_name: string }>).map((r) => r.table_name);
  } catch {
    existingTables = [];
  }

  const postsMediaType = postsColumns.includes("media_type");
  const postsProcessingStatus = postsColumns.includes("processing_status");
  const postMediaTable = existingTables.includes("post_media");
  const postMediaAssetIdColumn = postMediaColumns.includes("media_asset_id");
  const mediaAssetsTable = existingTables.includes("media_assets");
  const affiliateCampaignsTable = existingTables.includes("affiliate_campaigns");
  const affiliateLinksTable = existingTables.includes("affiliate_links");
  const postAffiliateLinksTable = existingTables.includes("post_affiliate_links");
  const affiliateClicksTable = existingTables.includes("affiliate_clicks");
  const schedulerRunsTable = existingTables.includes("scheduler_runs");

  const is0003Applied = appliedMigrations.some(
    (m) => m.created_at === "1788942355838" || m.hash.startsWith("d6a4cc0d")
  );

  const is0004Applied = appliedMigrations.some(
    (m) => m.created_at === "1788948165485"
  );

  const allObjectsExist =
    postsMediaType &&
    postsProcessingStatus &&
    postMediaTable &&
    postMediaAssetIdColumn &&
    mediaAssetsTable &&
    affiliateCampaignsTable &&
    affiliateLinksTable &&
    postAffiliateLinksTable &&
    affiliateClicksTable &&
    schedulerRunsTable;

  return {
    appliedMigrations,
    is0003Applied,
    is0004Applied,
    schemaObjects: {
      postsMediaType,
      postsProcessingStatus,
      postMediaTable,
      postMediaAssetIdColumn,
      mediaAssetsTable,
      affiliateCampaignsTable,
      affiliateLinksTable,
      postAffiliateLinksTable,
      affiliateClicksTable,
      schedulerRunsTable,
    },
    allObjectsExist,
  };
}

/**
 * Migration runner executing committed Drizzle migrations.
 * Committed Drizzle migrations in src/db/migrations are the single source of truth.
 * Works both in Node environments (with filesystem access) and
 * serverless runtimes (via bundled migrations).
 */
export async function ensureDatabaseSchema(): Promise<void> {
  const migrationsFolder = path.resolve(process.cwd(), "src/db/migrations");
  const journalPath = path.resolve(migrationsFolder, "meta/_journal.json");

  // If running in an environment where the migration folder is present (local, CI)
  if (fs.existsSync(journalPath)) {
    try {
      await migrate(db, { migrationsFolder });
      return;
    } catch {
      // If filesystem runner fails, fall through to bundled migrator
    }
  }

  // Serverless runtime execution via bundled migrations
  // Uses Drizzle dialect's native migrate method
  type DrizzleInternal = {
    dialect: {
      migrate: (
        migrations: unknown,
        session: unknown,
        config: { migrationsTable: string; migrationsSchema: string }
      ) => Promise<void>;
    };
    session: unknown;
  };

  const drizzleInternal = db as unknown as DrizzleInternal;
  await drizzleInternal.dialect.migrate(BUNDLED_MIGRATIONS, drizzleInternal.session, {
    migrationsTable: "__drizzle_migrations",
    migrationsSchema: "drizzle",
  });
}

export async function runDatabaseMigrations(): Promise<void> {
  await ensureDatabaseSchema();
}
