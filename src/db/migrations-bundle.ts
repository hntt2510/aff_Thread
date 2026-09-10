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
  },
  {
    "tag": "0005_dusty_dragon_man",
    "folderMillis": 1788958130814,
    "bps": true,
    "hash": "85d496cb185f61083ac168bdef2879bd6450f50558e6c9c5b6a1e8f0789d2b64",
    "sql": [
      "CREATE TABLE \"affiliate_replies\" (\n\t\"id\" text PRIMARY KEY NOT NULL,\n\t\"monetization_plan_id\" text NOT NULL,\n\t\"post_id\" text NOT NULL,\n\t\"sequence_no\" integer DEFAULT 1 NOT NULL,\n\t\"reply_text\" text NOT NULL,\n\t\"status\" text DEFAULT 'PENDING' NOT NULL,\n\t\"idempotency_key\" text NOT NULL,\n\t\"threads_container_id\" text,\n\t\"threads_reply_id\" text,\n\t\"attempts\" integer DEFAULT 0 NOT NULL,\n\t\"last_attempt_at\" timestamp with time zone,\n\t\"last_error\" text,\n\t\"scheduled_at\" timestamp with time zone,\n\t\"published_at\" timestamp with time zone,\n\t\"created_at\" timestamp with time zone DEFAULT now() NOT NULL,\n\t\"updated_at\" timestamp with time zone DEFAULT now() NOT NULL,\n\tCONSTRAINT \"affiliate_replies_idempotency_key_unique\" UNIQUE(\"idempotency_key\")\n);",
      "CREATE TABLE \"affiliate_reply_links\" (\n\t\"id\" text PRIMARY KEY NOT NULL,\n\t\"affiliate_reply_id\" text NOT NULL,\n\t\"affiliate_link_id\" text,\n\t\"destination_url\" text NOT NULL,\n\t\"position\" integer DEFAULT 0 NOT NULL,\n\t\"label\" text,\n\t\"metadata_json\" text,\n\t\"created_at\" timestamp with time zone DEFAULT now() NOT NULL\n);",
      "CREATE TABLE \"monetization_plans\" (\n\t\"id\" text PRIMARY KEY NOT NULL,\n\t\"post_id\" text NOT NULL,\n\t\"status\" text DEFAULT 'DRAFT' NOT NULL,\n\t\"source\" text DEFAULT 'MANUAL' NOT NULL,\n\t\"score_at_creation\" integer,\n\t\"scheduled_at\" timestamp with time zone,\n\t\"created_at\" timestamp with time zone DEFAULT now() NOT NULL,\n\t\"updated_at\" timestamp with time zone DEFAULT now() NOT NULL\n);",
      "CREATE TABLE \"monetization_runs\" (\n\t\"id\" text PRIMARY KEY NOT NULL,\n\t\"started_at\" timestamp with time zone DEFAULT now() NOT NULL,\n\t\"finished_at\" timestamp with time zone,\n\t\"trigger_source\" text DEFAULT 'cron-job-org' NOT NULL,\n\t\"collected\" integer DEFAULT 0 NOT NULL,\n\t\"evaluated\" integer DEFAULT 0 NOT NULL,\n\t\"eligible\" integer DEFAULT 0 NOT NULL,\n\t\"replies_claimed\" integer DEFAULT 0 NOT NULL,\n\t\"replies_published\" integer DEFAULT 0 NOT NULL,\n\t\"replies_deferred\" integer DEFAULT 0 NOT NULL,\n\t\"replies_failed\" integer DEFAULT 0 NOT NULL,\n\t\"ambiguous\" integer DEFAULT 0 NOT NULL,\n\t\"duration_ms\" integer DEFAULT 0 NOT NULL,\n\t\"sanitized_error\" text\n);",
      "CREATE TABLE \"post_insight_snapshots\" (\n\t\"id\" text PRIMARY KEY NOT NULL,\n\t\"post_id\" text NOT NULL,\n\t\"threads_post_id\" text NOT NULL,\n\t\"views\" integer,\n\t\"likes\" integer,\n\t\"replies\" integer,\n\t\"reposts\" integer,\n\t\"quotes\" integer,\n\t\"shares\" integer,\n\t\"raw_metrics_json\" text,\n\t\"collected_at\" timestamp with time zone DEFAULT now() NOT NULL,\n\t\"created_at\" timestamp with time zone DEFAULT now() NOT NULL\n);",
      "CREATE TABLE \"post_monetization_state\" (\n\t\"id\" text PRIMARY KEY NOT NULL,\n\t\"post_id\" text NOT NULL,\n\t\"status\" text DEFAULT 'WATCHING' NOT NULL,\n\t\"current_score\" integer DEFAULT 0 NOT NULL,\n\t\"score_version\" text DEFAULT 'v1' NOT NULL,\n\t\"score_explanation\" text,\n\t\"first_eligible_at\" timestamp with time zone,\n\t\"last_evaluated_at\" timestamp with time zone,\n\t\"created_at\" timestamp with time zone DEFAULT now() NOT NULL,\n\t\"updated_at\" timestamp with time zone DEFAULT now() NOT NULL,\n\tCONSTRAINT \"post_monetization_state_post_id_unique\" UNIQUE(\"post_id\")\n);",
      "ALTER TABLE \"affiliate_replies\" ADD CONSTRAINT \"affiliate_replies_monetization_plan_id_monetization_plans_id_fk\" FOREIGN KEY (\"monetization_plan_id\") REFERENCES \"public\".\"monetization_plans\"(\"id\") ON DELETE cascade ON UPDATE no action;",
      "ALTER TABLE \"affiliate_replies\" ADD CONSTRAINT \"affiliate_replies_post_id_posts_id_fk\" FOREIGN KEY (\"post_id\") REFERENCES \"public\".\"posts\"(\"id\") ON DELETE cascade ON UPDATE no action;",
      "ALTER TABLE \"affiliate_reply_links\" ADD CONSTRAINT \"affiliate_reply_links_affiliate_reply_id_affiliate_replies_id_fk\" FOREIGN KEY (\"affiliate_reply_id\") REFERENCES \"public\".\"affiliate_replies\"(\"id\") ON DELETE cascade ON UPDATE no action;",
      "ALTER TABLE \"affiliate_reply_links\" ADD CONSTRAINT \"affiliate_reply_links_affiliate_link_id_affiliate_links_id_fk\" FOREIGN KEY (\"affiliate_link_id\") REFERENCES \"public\".\"affiliate_links\"(\"id\") ON DELETE set null ON UPDATE no action;",
      "ALTER TABLE \"monetization_plans\" ADD CONSTRAINT \"monetization_plans_post_id_posts_id_fk\" FOREIGN KEY (\"post_id\") REFERENCES \"public\".\"posts\"(\"id\") ON DELETE cascade ON UPDATE no action;",
      "ALTER TABLE \"post_insight_snapshots\" ADD CONSTRAINT \"post_insight_snapshots_post_id_posts_id_fk\" FOREIGN KEY (\"post_id\") REFERENCES \"public\".\"posts\"(\"id\") ON DELETE cascade ON UPDATE no action;",
      "ALTER TABLE \"post_monetization_state\" ADD CONSTRAINT \"post_monetization_state_post_id_posts_id_fk\" FOREIGN KEY (\"post_id\") REFERENCES \"public\".\"posts\"(\"id\") ON DELETE cascade ON UPDATE no action;",
      "CREATE INDEX \"affiliate_replies_plan_idx\" ON \"affiliate_replies\" USING btree (\"monetization_plan_id\");",
      "CREATE INDEX \"affiliate_replies_post_idx\" ON \"affiliate_replies\" USING btree (\"post_id\");",
      "CREATE INDEX \"affiliate_replies_status_idx\" ON \"affiliate_replies\" USING btree (\"status\");",
      "CREATE INDEX \"affiliate_replies_scheduled_at_idx\" ON \"affiliate_replies\" USING btree (\"scheduled_at\");",
      "CREATE INDEX \"affiliate_replies_idempotency_key_idx\" ON \"affiliate_replies\" USING btree (\"idempotency_key\");",
      "CREATE INDEX \"affiliate_reply_links_reply_idx\" ON \"affiliate_reply_links\" USING btree (\"affiliate_reply_id\");",
      "CREATE INDEX \"affiliate_reply_links_link_idx\" ON \"affiliate_reply_links\" USING btree (\"affiliate_link_id\");",
      "CREATE INDEX \"monetization_plans_post_id_idx\" ON \"monetization_plans\" USING btree (\"post_id\");",
      "CREATE INDEX \"monetization_plans_status_idx\" ON \"monetization_plans\" USING btree (\"status\");",
      "CREATE INDEX \"monetization_plans_scheduled_at_idx\" ON \"monetization_plans\" USING btree (\"scheduled_at\");",
      "CREATE INDEX \"monetization_runs_started_at_idx\" ON \"monetization_runs\" USING btree (\"started_at\");",
      "CREATE INDEX \"post_insight_snapshots_post_collected_idx\" ON \"post_insight_snapshots\" USING btree (\"post_id\",\"collected_at\");",
      "CREATE INDEX \"post_insight_snapshots_collected_at_idx\" ON \"post_insight_snapshots\" USING btree (\"collected_at\");",
      "CREATE INDEX \"post_insight_snapshots_threads_post_id_idx\" ON \"post_insight_snapshots\" USING btree (\"threads_post_id\");",
      "CREATE INDEX \"post_monetization_state_status_idx\" ON \"post_monetization_state\" USING btree (\"status\");",
      "CREATE INDEX \"post_monetization_state_score_idx\" ON \"post_monetization_state\" USING btree (\"current_score\");",
      "CREATE INDEX \"post_monetization_state_last_eval_idx\" ON \"post_monetization_state\" USING btree (\"last_evaluated_at\");"
    ]
  },
  {
    "tag": "0006_even_may_parker",
    "folderMillis": 1788959866078,
    "bps": true,
    "hash": "f45ee443cea3a3c88be8913ef1db8d75650d218ce5167cd36cc160bbe11df64b",
    "sql": [
      "CREATE TABLE \"affiliate_performance_snapshots\" (\n\t\"id\" text PRIMARY KEY NOT NULL,\n\t\"product_id\" text,\n\t\"offer_id\" text,\n\t\"period_start\" timestamp with time zone NOT NULL,\n\t\"period_end\" timestamp with time zone NOT NULL,\n\t\"clicks\" integer,\n\t\"orders\" integer,\n\t\"items_sold\" integer,\n\t\"order_amount\" integer,\n\t\"estimated_commission\" integer,\n\t\"source\" text DEFAULT 'SHOPEE_REPORT' NOT NULL,\n\t\"captured_at\" timestamp with time zone DEFAULT now() NOT NULL,\n\t\"created_at\" timestamp with time zone DEFAULT now() NOT NULL\n);",
      "CREATE TABLE \"affiliate_product_offers\" (\n\t\"id\" text PRIMARY KEY NOT NULL,\n\t\"product_id\" text NOT NULL,\n\t\"captured_week\" text NOT NULL,\n\t\"captured_at\" timestamp with time zone DEFAULT now() NOT NULL,\n\t\"affiliate_url\" text NOT NULL,\n\t\"commission_rate\" text,\n\t\"commission_amount\" integer,\n\t\"sold_count\" integer,\n\t\"source\" text DEFAULT 'MANUAL_IMPORT' NOT NULL,\n\t\"source_metadata_json\" text,\n\t\"is_active\" boolean DEFAULT true NOT NULL,\n\t\"created_at\" timestamp with time zone DEFAULT now() NOT NULL\n);",
      "CREATE TABLE \"affiliate_products\" (\n\t\"id\" text PRIMARY KEY NOT NULL,\n\t\"provider\" text DEFAULT 'SHOPEE' NOT NULL,\n\t\"external_product_id\" text,\n\t\"shop_id\" text,\n\t\"title\" text NOT NULL,\n\t\"normalized_title\" text,\n\t\"category\" text,\n\t\"product_url\" text NOT NULL,\n\t\"image_url\" text,\n\t\"currency\" text DEFAULT 'VND' NOT NULL,\n\t\"is_active\" boolean DEFAULT true NOT NULL,\n\t\"first_seen_at\" timestamp with time zone DEFAULT now() NOT NULL,\n\t\"last_seen_at\" timestamp with time zone DEFAULT now() NOT NULL,\n\t\"created_at\" timestamp with time zone DEFAULT now() NOT NULL,\n\t\"updated_at\" timestamp with time zone DEFAULT now() NOT NULL\n);",
      "CREATE TABLE \"product_deal_observations\" (\n\t\"id\" text PRIMARY KEY NOT NULL,\n\t\"product_id\" text NOT NULL,\n\t\"offer_id\" text,\n\t\"observed_at\" timestamp with time zone DEFAULT now() NOT NULL,\n\t\"observed_price\" integer,\n\t\"original_price\" integer,\n\t\"currency\" text DEFAULT 'VND' NOT NULL,\n\t\"direct_discount_percent\" text,\n\t\"direct_discount_amount\" integer,\n\t\"voucher_code\" text,\n\t\"voucher_type\" text,\n\t\"voucher_discount_type\" text,\n\t\"voucher_discount_percent\" text,\n\t\"voucher_discount_amount\" integer,\n\t\"voucher_max_discount\" integer,\n\t\"voucher_min_spend\" integer,\n\t\"voucher_valid_from\" timestamp with time zone,\n\t\"voucher_valid_until\" timestamp with time zone,\n\t\"flash_sale\" boolean,\n\t\"free_shipping\" boolean,\n\t\"availability_status\" text,\n\t\"source\" text DEFAULT 'MANUAL' NOT NULL,\n\t\"confidence\" text DEFAULT '1.00',\n\t\"raw_metadata_json\" text,\n\t\"created_at\" timestamp with time zone DEFAULT now() NOT NULL\n);",
      "CREATE TABLE \"weekly_product_pool\" (\n\t\"id\" text PRIMARY KEY NOT NULL,\n\t\"week_start\" text NOT NULL,\n\t\"product_id\" text NOT NULL,\n\t\"offer_id\" text,\n\t\"rank\" integer NOT NULL,\n\t\"catalog_score\" integer DEFAULT 0 NOT NULL,\n\t\"reason_json\" text,\n\t\"selected_at\" timestamp with time zone DEFAULT now() NOT NULL\n);",
      "ALTER TABLE \"affiliate_replies\" ADD COLUMN \"next_eligible_at\" timestamp with time zone;",
      "ALTER TABLE \"affiliate_replies\" ADD COLUMN \"deal_observation_id\" text;",
      "ALTER TABLE \"affiliate_replies\" ADD COLUMN \"price_calculation_snapshot\" text;",
      "ALTER TABLE \"affiliate_replies\" ADD COLUMN \"requires_revalidation\" boolean DEFAULT false;",
      "ALTER TABLE \"affiliate_replies\" ADD COLUMN \"last_validated_at\" timestamp with time zone;",
      "ALTER TABLE \"affiliate_replies\" ADD COLUMN \"validation_status\" text DEFAULT 'NOT_REQUIRED';",
      "ALTER TABLE \"affiliate_performance_snapshots\" ADD CONSTRAINT \"affiliate_performance_snapshots_product_id_affiliate_products_id_fk\" FOREIGN KEY (\"product_id\") REFERENCES \"public\".\"affiliate_products\"(\"id\") ON DELETE set null ON UPDATE no action;",
      "ALTER TABLE \"affiliate_performance_snapshots\" ADD CONSTRAINT \"affiliate_performance_snapshots_offer_id_affiliate_product_offers_id_fk\" FOREIGN KEY (\"offer_id\") REFERENCES \"public\".\"affiliate_product_offers\"(\"id\") ON DELETE set null ON UPDATE no action;",
      "ALTER TABLE \"affiliate_product_offers\" ADD CONSTRAINT \"affiliate_product_offers_product_id_affiliate_products_id_fk\" FOREIGN KEY (\"product_id\") REFERENCES \"public\".\"affiliate_products\"(\"id\") ON DELETE cascade ON UPDATE no action;",
      "ALTER TABLE \"product_deal_observations\" ADD CONSTRAINT \"product_deal_observations_product_id_affiliate_products_id_fk\" FOREIGN KEY (\"product_id\") REFERENCES \"public\".\"affiliate_products\"(\"id\") ON DELETE cascade ON UPDATE no action;",
      "ALTER TABLE \"product_deal_observations\" ADD CONSTRAINT \"product_deal_observations_offer_id_affiliate_product_offers_id_fk\" FOREIGN KEY (\"offer_id\") REFERENCES \"public\".\"affiliate_product_offers\"(\"id\") ON DELETE set null ON UPDATE no action;",
      "ALTER TABLE \"weekly_product_pool\" ADD CONSTRAINT \"weekly_product_pool_product_id_affiliate_products_id_fk\" FOREIGN KEY (\"product_id\") REFERENCES \"public\".\"affiliate_products\"(\"id\") ON DELETE cascade ON UPDATE no action;",
      "ALTER TABLE \"weekly_product_pool\" ADD CONSTRAINT \"weekly_product_pool_offer_id_affiliate_product_offers_id_fk\" FOREIGN KEY (\"offer_id\") REFERENCES \"public\".\"affiliate_product_offers\"(\"id\") ON DELETE set null ON UPDATE no action;",
      "CREATE INDEX \"affiliate_perf_product_period_idx\" ON \"affiliate_performance_snapshots\" USING btree (\"product_id\",\"period_start\");",
      "CREATE INDEX \"affiliate_perf_period_start_idx\" ON \"affiliate_performance_snapshots\" USING btree (\"period_start\");",
      "CREATE INDEX \"affiliate_product_offers_product_week_idx\" ON \"affiliate_product_offers\" USING btree (\"product_id\",\"captured_week\");",
      "CREATE INDEX \"affiliate_product_offers_captured_week_idx\" ON \"affiliate_product_offers\" USING btree (\"captured_week\");",
      "CREATE INDEX \"affiliate_product_offers_product_id_idx\" ON \"affiliate_product_offers\" USING btree (\"product_id\");",
      "CREATE INDEX \"affiliate_products_provider_ext_idx\" ON \"affiliate_products\" USING btree (\"provider\",\"external_product_id\");",
      "CREATE INDEX \"affiliate_products_category_idx\" ON \"affiliate_products\" USING btree (\"category\");",
      "CREATE INDEX \"affiliate_products_is_active_idx\" ON \"affiliate_products\" USING btree (\"is_active\");",
      "CREATE INDEX \"affiliate_products_created_at_idx\" ON \"affiliate_products\" USING btree (\"created_at\");",
      "CREATE INDEX \"deal_obs_product_observed_idx\" ON \"product_deal_observations\" USING btree (\"product_id\",\"observed_at\");",
      "CREATE INDEX \"deal_obs_observed_at_idx\" ON \"product_deal_observations\" USING btree (\"observed_at\");",
      "CREATE INDEX \"weekly_product_pool_week_rank_idx\" ON \"weekly_product_pool\" USING btree (\"week_start\",\"rank\");",
      "CREATE INDEX \"weekly_product_pool_week_product_idx\" ON \"weekly_product_pool\" USING btree (\"week_start\",\"product_id\");",
      "CREATE INDEX \"affiliate_replies_next_eligible_idx\" ON \"affiliate_replies\" USING btree (\"next_eligible_at\");"
    ]
  },
  {
    "tag": "0007_conscious_orphan",
    "folderMillis": 1788963264507,
    "bps": true,
    "hash": "019019e3e9b6d8ebd678624f541f4892acdb4e144002aa3b8fda3ecbe8f2562f",
    "sql": [
      "CREATE TABLE \"shopee_acquisition_runs\" (\n\t\"id\" text PRIMARY KEY NOT NULL,\n\t\"external_run_id\" text,\n\t\"acquisition_batch_id\" text NOT NULL,\n\t\"started_at\" timestamp with time zone DEFAULT now() NOT NULL,\n\t\"completed_at\" timestamp with time zone,\n\t\"provider\" text DEFAULT 'SHOPEE' NOT NULL,\n\t\"status\" text DEFAULT 'PENDING' NOT NULL,\n\t\"products_seen\" integer DEFAULT 0 NOT NULL,\n\t\"products_valid\" integer DEFAULT 0 NOT NULL,\n\t\"products_imported\" integer DEFAULT 0 NOT NULL,\n\t\"products_rejected\" integer DEFAULT 0 NOT NULL,\n\t\"warning_count\" integer DEFAULT 0 NOT NULL,\n\t\"source\" text DEFAULT 'SHOPEE_SESSION_WORKER' NOT NULL,\n\t\"error_summary\" text,\n\t\"raw_metadata_json\" text,\n\t\"created_at\" timestamp with time zone DEFAULT now() NOT NULL\n);",
      "CREATE INDEX \"shopee_acq_batch_id_idx\" ON \"shopee_acquisition_runs\" USING btree (\"acquisition_batch_id\");",
      "CREATE INDEX \"shopee_acq_status_idx\" ON \"shopee_acquisition_runs\" USING btree (\"status\");",
      "CREATE INDEX \"shopee_acq_created_at_idx\" ON \"shopee_acquisition_runs\" USING btree (\"created_at\");"
    ]
  },
  {
    "tag": "0008_shopee_session_cookies",
    "folderMillis": 1788970000000,
    "bps": true,
    "hash": "0d8a4702f28e14c97110cded883419da8e1bccfa973707e174958e6fcb983a89",
    "sql": [
      "CREATE TABLE \"shopee_sessions\" (\n\t\"id\" text PRIMARY KEY NOT NULL,\n\t\"encrypted_cookies\" text NOT NULL,\n\t\"cookies_iv\" text NOT NULL,\n\t\"cookies_auth_tag\" text NOT NULL,\n\t\"status\" text DEFAULT 'ACTIVE' NOT NULL,\n\t\"username\" text,\n\t\"affiliate_id\" text,\n\t\"last_validated_at\" timestamp with time zone,\n\t\"last_error\" text,\n\t\"created_at\" timestamp with time zone DEFAULT now() NOT NULL,\n\t\"updated_at\" timestamp with time zone DEFAULT now() NOT NULL\n);",
      "CREATE INDEX \"shopee_sessions_status_idx\" ON \"shopee_sessions\" USING btree (\"status\");",
      "CREATE INDEX \"shopee_sessions_updated_at_idx\" ON \"shopee_sessions\" USING btree (\"updated_at\");"
    ]
  }
];

