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
});
