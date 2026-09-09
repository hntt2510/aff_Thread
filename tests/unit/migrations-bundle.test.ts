import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { BUNDLED_MIGRATIONS } from "@/db/migrations-bundle";

describe("Migrations Bundle Integrity", () => {
  it("matches journal entries and hashes", () => {
    const journalPath = path.resolve(process.cwd(), "src/db/migrations/meta/_journal.json");
    const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));

    expect(BUNDLED_MIGRATIONS.length).toBe(journal.entries.length);

    for (let i = 0; i < journal.entries.length; i++) {
      const entry = journal.entries[i];
      const bundled = BUNDLED_MIGRATIONS[i];

      expect(bundled.tag).toBe(entry.tag);
      expect(bundled.folderMillis).toBe(entry.when);

      const sqlPath = path.resolve(process.cwd(), "src/db/migrations", `${entry.tag}.sql`);
      const rawSql = fs.readFileSync(sqlPath, "utf8");
      const expectedHash = crypto.createHash("sha256").update(rawSql).digest("hex");

      expect(bundled.hash).toBe(expectedHash);
      expect(bundled.sql.length).toBeGreaterThan(0);
    }
  });

  it("includes migration 0003 with all expected schema objects", () => {
    const mig0003 = BUNDLED_MIGRATIONS.find((m) => m.tag === "0003_media_affiliate_observability");
    expect(mig0003).toBeDefined();

    const allStatements = mig0003!.sql.join("\n");
    expect(allStatements).toContain('CREATE TABLE "post_media"');
    expect(allStatements).toContain('CREATE TABLE "affiliate_campaigns"');
    expect(allStatements).toContain('CREATE TABLE "affiliate_links"');
    expect(allStatements).toContain('CREATE TABLE "post_affiliate_links"');
    expect(allStatements).toContain('CREATE TABLE "affiliate_clicks"');
    expect(allStatements).toContain('CREATE TABLE "scheduler_runs"');
    expect(allStatements).toContain('ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "media_type"');
    expect(allStatements).toContain('ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "processing_status"');
  });

  it("includes migration 0004 with media_assets and media_asset_id", () => {
    const mig0004 = BUNDLED_MIGRATIONS.find((m) => m.tag === "0004_demonic_monster_badoon");
    expect(mig0004).toBeDefined();

    const allStatements = mig0004!.sql.join("\n");
    expect(allStatements).toContain('CREATE TABLE "media_assets"');
    expect(allStatements).toContain('ALTER TABLE "post_media" ADD COLUMN "media_asset_id"');
  });

  it("includes migration 0005 with monetization core tables", () => {
    const mig0005 = BUNDLED_MIGRATIONS.find((m) => m.tag === "0005_dusty_dragon_man");
    expect(mig0005).toBeDefined();

    const allStatements = mig0005!.sql.join("\n");
    expect(allStatements).toContain('CREATE TABLE "post_insight_snapshots"');
    expect(allStatements).toContain('CREATE TABLE "post_monetization_state"');
    expect(allStatements).toContain('CREATE TABLE "monetization_plans"');
    expect(allStatements).toContain('CREATE TABLE "affiliate_replies"');
    expect(allStatements).toContain('CREATE TABLE "affiliate_reply_links"');
    expect(allStatements).toContain('CREATE TABLE "monetization_runs"');
  });

  it("includes migration 0006 with Shopee Deal Intelligence tables and reply fields", () => {
    const mig0006 = BUNDLED_MIGRATIONS.find((m) => m.tag === "0006_even_may_parker");
    expect(mig0006).toBeDefined();

    const allStatements = mig0006!.sql.join("\n");
    expect(allStatements).toContain('CREATE TABLE "affiliate_products"');
    expect(allStatements).toContain('CREATE TABLE "affiliate_product_offers"');
    expect(allStatements).toContain('CREATE TABLE "affiliate_performance_snapshots"');
    expect(allStatements).toContain('CREATE TABLE "weekly_product_pool"');
    expect(allStatements).toContain('CREATE TABLE "product_deal_observations"');
    expect(allStatements).toContain('ALTER TABLE "affiliate_replies" ADD COLUMN "next_eligible_at"');
  });

  it("includes migration 0007 with Shopee Acquisition Runs audit table", () => {
    const mig0007 = BUNDLED_MIGRATIONS.find((m) => m.tag === "0007_conscious_orphan");
    expect(mig0007).toBeDefined();

    const allStatements = mig0007!.sql.join("\n");
    expect(allStatements).toContain('CREATE TABLE "shopee_acquisition_runs"');
    expect(allStatements).toContain('acquisition_batch_id');
    expect(allStatements).toContain('products_imported');
    expect(allStatements).toContain('source');
  });
});
