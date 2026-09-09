// Auto-generated bundled migrations for serverless runtime execution
// Matches committed Drizzle migrations in src/db/migrations

export interface BundledMigration {
  tag: string;
  folderMillis: number;
  bps: boolean;
  hash: string;
  sql: string[];
}

export const BUNDLED_MIGRATIONS: BundledMigration[] = [
  {
    "tag": "0000_talented_adam_destine",
    "folderMillis": 1788851104191,
    "bps": true,
    "hash": "5026dea5d0025316cb20f86659bdf4ffa396e2be53068f6c66ed04a6859c39c1",
    "sql": [
      "CREATE TABLE \"posts\" (\n\t\"id\" text PRIMARY KEY NOT NULL,\n\t\"account_id\" text NOT NULL,\n\t\"text\" text NOT NULL,\n\t\"container_id\" text,\n\t\"threads_post_id\" text,\n\t\"status\" text DEFAULT 'PUBLISHING' NOT NULL,\n\t\"error_code\" text,\n\t\"error_message\" text,\n\t\"created_at\" timestamp with time zone DEFAULT now() NOT NULL,\n\t\"published_at\" timestamp with time zone\n);",
      "CREATE TABLE \"threads_accounts\" (\n\t\"id\" text PRIMARY KEY NOT NULL,\n\t\"threads_user_id\" text NOT NULL,\n\t\"username\" text NOT NULL,\n\t\"display_name\" text NOT NULL,\n\t\"avatar_url\" text,\n\t\"biography\" text,\n\t\"encrypted_access_token\" text NOT NULL,\n\t\"token_iv\" text NOT NULL,\n\t\"token_auth_tag\" text NOT NULL,\n\t\"status\" text DEFAULT 'ACTIVE' NOT NULL,\n\t\"last_checked_at\" timestamp with time zone,\n\t\"created_at\" timestamp with time zone DEFAULT now() NOT NULL,\n\t\"updated_at\" timestamp with time zone DEFAULT now() NOT NULL,\n\tCONSTRAINT \"threads_accounts_threads_user_id_unique\" UNIQUE(\"threads_user_id\")\n);",
      "ALTER TABLE \"posts\" ADD CONSTRAINT \"posts_account_id_threads_accounts_id_fk\" FOREIGN KEY (\"account_id\") REFERENCES \"public\".\"threads_accounts\"(\"id\") ON DELETE cascade ON UPDATE no action;"
    ]
  },
  {
    "tag": "0001_lazy_dagger",
    "folderMillis": 1788859429750,
    "bps": true,
    "hash": "76ed9cd13ee9150844ef1f6ded59d042a0856016a0cb4229a852bb7fd0c10e75",
    "sql": [
      "ALTER TABLE \"posts\" DROP CONSTRAINT \"posts_account_id_threads_accounts_id_fk\";",
      "ALTER TABLE \"posts\" ALTER COLUMN \"account_id\" DROP NOT NULL;",
      "ALTER TABLE \"posts\" ADD COLUMN \"account_threads_user_id\" text;",
      "ALTER TABLE \"posts\" ADD COLUMN \"account_username\" text;",
      "ALTER TABLE \"posts\" ADD COLUMN \"account_display_name\" text;",
      "UPDATE \"posts\" p\nSET\n  \"account_threads_user_id\" = a.\"threads_user_id\",\n  \"account_username\"        = a.\"username\",\n  \"account_display_name\"    = a.\"display_name\"\nFROM \"threads_accounts\" a\nWHERE p.\"account_id\" = a.\"id\"\n  AND p.\"account_threads_user_id\" IS NULL;",
      "ALTER TABLE \"posts\" ALTER COLUMN \"account_threads_user_id\" SET NOT NULL;",
      "ALTER TABLE \"posts\" ALTER COLUMN \"account_username\" SET NOT NULL;",
      "ALTER TABLE \"posts\" ALTER COLUMN \"account_display_name\" SET NOT NULL;",
      "ALTER TABLE \"posts\" ADD CONSTRAINT \"posts_account_id_threads_accounts_id_fk\"\n  FOREIGN KEY (\"account_id\") REFERENCES \"public\".\"threads_accounts\"(\"id\")\n  ON DELETE set null ON UPDATE no action;"
    ]
  },
  {
    "tag": "0002_scheduling_queue",
    "folderMillis": 1788935000000,
    "bps": true,
    "hash": "0637d248d34a9363d5415dc827ed68f2b81533f850a632a37a1ab0c9d28b61f9",
    "sql": [
      "ALTER TABLE \"posts\" ADD COLUMN IF NOT EXISTS \"scheduled_at\" timestamp with time zone;",
      "ALTER TABLE \"posts\" ADD COLUMN IF NOT EXISTS \"failed_at\" timestamp with time zone;",
      "ALTER TABLE \"posts\" ADD COLUMN IF NOT EXISTS \"cancelled_at\" timestamp with time zone;",
      "ALTER TABLE \"posts\" ADD COLUMN IF NOT EXISTS \"publish_attempts\" integer DEFAULT 0 NOT NULL;",
      "ALTER TABLE \"posts\" ADD COLUMN IF NOT EXISTS \"last_attempt_at\" timestamp with time zone;",
      "ALTER TABLE \"posts\" ADD COLUMN IF NOT EXISTS \"last_error\" text;",
      "ALTER TABLE \"posts\" ADD COLUMN IF NOT EXISTS \"updated_at\" timestamp with time zone DEFAULT now() NOT NULL;",
      "CREATE INDEX IF NOT EXISTS \"posts_scheduled_due_idx\" ON \"posts\" (\"status\", \"scheduled_at\") WHERE \"status\" = 'SCHEDULED';"
    ]
  },
  {
    "tag": "0003_media_affiliate_observability",
    "folderMillis": 1788942355838,
    "bps": true,
    "hash": "d6a4cc0d61f2e09b19173c3e9ec38f02f7616a88eb9c8ec119316fd4f99b836b",
    "sql": [
      "CREATE TABLE \"affiliate_campaigns\" (\n\t\"id\" text PRIMARY KEY NOT NULL,\n\t\"name\" text NOT NULL,\n\t\"network\" text,\n\t\"description\" text,\n\t\"status\" text DEFAULT 'ACTIVE' NOT NULL,\n\t\"created_at\" timestamp with time zone DEFAULT now() NOT NULL,\n\t\"updated_at\" timestamp with time zone DEFAULT now() NOT NULL\n);",
      "CREATE TABLE \"affiliate_clicks\" (\n\t\"id\" text PRIMARY KEY NOT NULL,\n\t\"affiliate_link_id\" text NOT NULL,\n\t\"post_id\" text,\n\t\"campaign_id\" text,\n\t\"clicked_at\" timestamp with time zone DEFAULT now() NOT NULL,\n\t\"anonymized_ip_hash\" text,\n\t\"user_agent_class\" text,\n\t\"is_bot\" boolean DEFAULT false NOT NULL,\n\t\"referer_domain\" text,\n\t\"country\" text\n);",
      "CREATE TABLE \"affiliate_links\" (\n\t\"id\" text PRIMARY KEY NOT NULL,\n\t\"campaign_id\" text,\n\t\"destination_url\" text NOT NULL,\n\t\"public_slug\" text NOT NULL,\n\t\"label\" text,\n\t\"network\" text,\n\t\"sub_id\" text,\n\t\"status\" text DEFAULT 'ACTIVE' NOT NULL,\n\t\"created_at\" timestamp with time zone DEFAULT now() NOT NULL,\n\t\"updated_at\" timestamp with time zone DEFAULT now() NOT NULL,\n\tCONSTRAINT \"affiliate_links_public_slug_unique\" UNIQUE(\"public_slug\")\n);",
      "CREATE TABLE \"post_affiliate_links\" (\n\t\"id\" text PRIMARY KEY NOT NULL,\n\t\"post_id\" text NOT NULL,\n\t\"affiliate_link_id\" text NOT NULL,\n\t\"position\" integer DEFAULT 0 NOT NULL,\n\t\"created_at\" timestamp with time zone DEFAULT now() NOT NULL\n);",
      "CREATE TABLE \"post_media\" (\n\t\"id\" text PRIMARY KEY NOT NULL,\n\t\"post_id\" text NOT NULL,\n\t\"media_kind\" text NOT NULL,\n\t\"source_url\" text NOT NULL,\n\t\"position\" integer DEFAULT 0 NOT NULL,\n\t\"alt_text\" text,\n\t\"container_id\" text,\n\t\"created_at\" timestamp with time zone DEFAULT now() NOT NULL\n);",
      "CREATE TABLE \"scheduler_runs\" (\n\t\"id\" text PRIMARY KEY NOT NULL,\n\t\"started_at\" timestamp with time zone DEFAULT now() NOT NULL,\n\t\"finished_at\" timestamp with time zone,\n\t\"trigger_source\" text DEFAULT 'cron-job-org' NOT NULL,\n\t\"claimed\" integer DEFAULT 0 NOT NULL,\n\t\"published\" integer DEFAULT 0 NOT NULL,\n\t\"rescheduled\" integer DEFAULT 0 NOT NULL,\n\t\"failed\" integer DEFAULT 0 NOT NULL,\n\t\"stale_recovered\" integer DEFAULT 0 NOT NULL,\n\t\"duration_ms\" integer DEFAULT 0 NOT NULL,\n\t\"sanitized_error\" text\n);",
      "ALTER TABLE \"posts\" ADD COLUMN IF NOT EXISTS \"media_type\" text DEFAULT 'TEXT' NOT NULL;",
      "ALTER TABLE \"posts\" ADD COLUMN IF NOT EXISTS \"processing_status\" text;",
      "ALTER TABLE \"affiliate_clicks\" ADD CONSTRAINT \"affiliate_clicks_affiliate_link_id_affiliate_links_id_fk\" FOREIGN KEY (\"affiliate_link_id\") REFERENCES \"public\".\"affiliate_links\"(\"id\") ON DELETE cascade ON UPDATE no action;",
      "ALTER TABLE \"affiliate_clicks\" ADD CONSTRAINT \"affiliate_clicks_post_id_posts_id_fk\" FOREIGN KEY (\"post_id\") REFERENCES \"public\".\"posts\"(\"id\") ON DELETE set null ON UPDATE no action;",
      "ALTER TABLE \"affiliate_clicks\" ADD CONSTRAINT \"affiliate_clicks_campaign_id_affiliate_campaigns_id_fk\" FOREIGN KEY (\"campaign_id\") REFERENCES \"public\".\"affiliate_campaigns\"(\"id\") ON DELETE set null ON UPDATE no action;",
      "ALTER TABLE \"affiliate_links\" ADD CONSTRAINT \"affiliate_links_campaign_id_affiliate_campaigns_id_fk\" FOREIGN KEY (\"campaign_id\") REFERENCES \"public\".\"affiliate_campaigns\"(\"id\") ON DELETE set null ON UPDATE no action;",
      "ALTER TABLE \"post_affiliate_links\" ADD CONSTRAINT \"post_affiliate_links_post_id_posts_id_fk\" FOREIGN KEY (\"post_id\") REFERENCES \"public\".\"posts\"(\"id\") ON DELETE cascade ON UPDATE no action;",
      "ALTER TABLE \"post_affiliate_links\" ADD CONSTRAINT \"post_affiliate_links_affiliate_link_id_affiliate_links_id_fk\" FOREIGN KEY (\"affiliate_link_id\") REFERENCES \"public\".\"affiliate_links\"(\"id\") ON DELETE cascade ON UPDATE no action;",
      "ALTER TABLE \"post_media\" ADD CONSTRAINT \"post_media_post_id_posts_id_fk\" FOREIGN KEY (\"post_id\") REFERENCES \"public\".\"posts\"(\"id\") ON DELETE cascade ON UPDATE no action;",
      "CREATE INDEX \"affiliate_clicks_link_idx\" ON \"affiliate_clicks\" USING btree (\"affiliate_link_id\");",
      "CREATE INDEX \"affiliate_clicks_post_idx\" ON \"affiliate_clicks\" USING btree (\"post_id\");",
      "CREATE INDEX \"affiliate_clicks_clicked_at_idx\" ON \"affiliate_clicks\" USING btree (\"clicked_at\");",
      "CREATE INDEX \"affiliate_clicks_is_bot_idx\" ON \"affiliate_clicks\" USING btree (\"is_bot\");",
      "CREATE INDEX \"affiliate_links_slug_idx\" ON \"affiliate_links\" USING btree (\"public_slug\");",
      "CREATE INDEX \"affiliate_links_campaign_idx\" ON \"affiliate_links\" USING btree (\"campaign_id\");",
      "CREATE INDEX \"affiliate_links_status_idx\" ON \"affiliate_links\" USING btree (\"status\");",
      "CREATE INDEX \"post_affiliate_links_post_idx\" ON \"post_affiliate_links\" USING btree (\"post_id\");",
      "CREATE INDEX \"post_affiliate_links_link_idx\" ON \"post_affiliate_links\" USING btree (\"affiliate_link_id\");",
      "CREATE INDEX \"post_media_post_id_idx\" ON \"post_media\" USING btree (\"post_id\");",
      "CREATE INDEX \"post_media_position_idx\" ON \"post_media\" USING btree (\"post_id\",\"position\");",
      "CREATE INDEX \"scheduler_runs_started_at_idx\" ON \"scheduler_runs\" USING btree (\"started_at\");"
    ]
  },
  {
    "tag": "0004_demonic_monster_badoon",
    "folderMillis": 1788948165485,
    "bps": true,
    "hash": "c93eda6979f117e35baaf9aa165f3c7e4d1fe1e733ae94c08c9a9e37e0ea8584",
    "sql": [
      "CREATE TABLE \"media_assets\" (\n\t\"id\" text PRIMARY KEY NOT NULL,\n\t\"account_id\" text,\n\t\"storage_provider\" text DEFAULT 'CLOUDINARY' NOT NULL,\n\t\"public_id\" text NOT NULL,\n\t\"resource_type\" text NOT NULL,\n\t\"secure_url\" text NOT NULL,\n\t\"original_filename\" text,\n\t\"bytes\" integer,\n\t\"width\" integer,\n\t\"height\" integer,\n\t\"format\" text,\n\t\"duration_seconds\" integer,\n\t\"upload_status\" text DEFAULT 'READY' NOT NULL,\n\t\"deleted_at\" timestamp with time zone,\n\t\"created_at\" timestamp with time zone DEFAULT now() NOT NULL,\n\t\"updated_at\" timestamp with time zone DEFAULT now() NOT NULL,\n\tCONSTRAINT \"media_assets_public_id_unique\" UNIQUE(\"public_id\")\n);",
      "ALTER TABLE \"post_media\" ADD COLUMN \"media_asset_id\" text;",
      "ALTER TABLE \"media_assets\" ADD CONSTRAINT \"media_assets_account_id_threads_accounts_id_fk\" FOREIGN KEY (\"account_id\") REFERENCES \"public\".\"threads_accounts\"(\"id\") ON DELETE set null ON UPDATE no action;",
      "CREATE INDEX \"media_assets_public_id_idx\" ON \"media_assets\" USING btree (\"public_id\");",
      "CREATE INDEX \"media_assets_resource_type_idx\" ON \"media_assets\" USING btree (\"resource_type\");",
      "CREATE INDEX \"media_assets_created_at_idx\" ON \"media_assets\" USING btree (\"created_at\");",
      "CREATE INDEX \"media_assets_deleted_at_idx\" ON \"media_assets\" USING btree (\"deleted_at\");",
      "ALTER TABLE \"post_media\" ADD CONSTRAINT \"post_media_media_asset_id_media_assets_id_fk\" FOREIGN KEY (\"media_asset_id\") REFERENCES \"public\".\"media_assets\"(\"id\") ON DELETE set null ON UPDATE no action;",
      "CREATE INDEX \"post_media_asset_id_idx\" ON \"post_media\" USING btree (\"media_asset_id\");"
    ]
  }
];
