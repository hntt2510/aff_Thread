import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const migrationsDir = path.join(rootDir, "src", "db", "migrations");
const journalPath = path.join(migrationsDir, "meta", "_journal.json");

const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
const entries = journal.entries.map((e) => {
  const filePath = path.join(migrationsDir, `${e.tag}.sql`);
  const rawSql = fs.readFileSync(filePath, "utf8");
  const hash = crypto.createHash("sha256").update(rawSql).digest("hex");
  const statements = rawSql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    tag: e.tag,
    folderMillis: e.when,
    bps: e.breakpoints,
    hash,
    sql: statements,
  };
});

const content = `// Auto-generated bundled migrations for serverless runtime execution
// Matches committed Drizzle migrations in src/db/migrations

export interface BundledMigration {
  tag: string;
  folderMillis: number;
  bps: boolean;
  hash: string;
  sql: string[];
}

export const BUNDLED_MIGRATIONS: BundledMigration[] = ${JSON.stringify(entries, null, 2)};
`;

const targetPath = path.join(rootDir, "src", "db", "migrations-bundle.ts");
fs.writeFileSync(targetPath, content, "utf8");
console.log(`Generated ${targetPath} with ${entries.length} migrations.`);
