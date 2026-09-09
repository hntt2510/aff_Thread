CREATE TABLE "affiliate_performance_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text,
	"offer_id" text,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"clicks" integer,
	"orders" integer,
	"items_sold" integer,
	"order_amount" integer,
	"estimated_commission" integer,
	"source" text DEFAULT 'SHOPEE_REPORT' NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "affiliate_product_offers" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"captured_week" text NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"affiliate_url" text NOT NULL,
	"commission_rate" text,
	"commission_amount" integer,
	"sold_count" integer,
	"source" text DEFAULT 'MANUAL_IMPORT' NOT NULL,
	"source_metadata_json" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "affiliate_products" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text DEFAULT 'SHOPEE' NOT NULL,
	"external_product_id" text,
	"shop_id" text,
	"title" text NOT NULL,
	"normalized_title" text,
	"category" text,
	"product_url" text NOT NULL,
	"image_url" text,
	"currency" text DEFAULT 'VND' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_deal_observations" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"offer_id" text,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"observed_price" integer,
	"original_price" integer,
	"currency" text DEFAULT 'VND' NOT NULL,
	"direct_discount_percent" text,
	"direct_discount_amount" integer,
	"voucher_code" text,
	"voucher_type" text,
	"voucher_discount_type" text,
	"voucher_discount_percent" text,
	"voucher_discount_amount" integer,
	"voucher_max_discount" integer,
	"voucher_min_spend" integer,
	"voucher_valid_from" timestamp with time zone,
	"voucher_valid_until" timestamp with time zone,
	"flash_sale" boolean,
	"free_shipping" boolean,
	"availability_status" text,
	"source" text DEFAULT 'MANUAL' NOT NULL,
	"confidence" text DEFAULT '1.00',
	"raw_metadata_json" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_product_pool" (
	"id" text PRIMARY KEY NOT NULL,
	"week_start" text NOT NULL,
	"product_id" text NOT NULL,
	"offer_id" text,
	"rank" integer NOT NULL,
	"catalog_score" integer DEFAULT 0 NOT NULL,
	"reason_json" text,
	"selected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "affiliate_replies" ADD COLUMN "next_eligible_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "affiliate_replies" ADD COLUMN "deal_observation_id" text;--> statement-breakpoint
ALTER TABLE "affiliate_replies" ADD COLUMN "price_calculation_snapshot" text;--> statement-breakpoint
ALTER TABLE "affiliate_replies" ADD COLUMN "requires_revalidation" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "affiliate_replies" ADD COLUMN "last_validated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "affiliate_replies" ADD COLUMN "validation_status" text DEFAULT 'NOT_REQUIRED';--> statement-breakpoint
ALTER TABLE "affiliate_performance_snapshots" ADD CONSTRAINT "affiliate_performance_snapshots_product_id_affiliate_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."affiliate_products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_performance_snapshots" ADD CONSTRAINT "affiliate_performance_snapshots_offer_id_affiliate_product_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."affiliate_product_offers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_product_offers" ADD CONSTRAINT "affiliate_product_offers_product_id_affiliate_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."affiliate_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_deal_observations" ADD CONSTRAINT "product_deal_observations_product_id_affiliate_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."affiliate_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_deal_observations" ADD CONSTRAINT "product_deal_observations_offer_id_affiliate_product_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."affiliate_product_offers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_product_pool" ADD CONSTRAINT "weekly_product_pool_product_id_affiliate_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."affiliate_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_product_pool" ADD CONSTRAINT "weekly_product_pool_offer_id_affiliate_product_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."affiliate_product_offers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "affiliate_perf_product_period_idx" ON "affiliate_performance_snapshots" USING btree ("product_id","period_start");--> statement-breakpoint
CREATE INDEX "affiliate_perf_period_start_idx" ON "affiliate_performance_snapshots" USING btree ("period_start");--> statement-breakpoint
CREATE INDEX "affiliate_product_offers_product_week_idx" ON "affiliate_product_offers" USING btree ("product_id","captured_week");--> statement-breakpoint
CREATE INDEX "affiliate_product_offers_captured_week_idx" ON "affiliate_product_offers" USING btree ("captured_week");--> statement-breakpoint
CREATE INDEX "affiliate_product_offers_product_id_idx" ON "affiliate_product_offers" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "affiliate_products_provider_ext_idx" ON "affiliate_products" USING btree ("provider","external_product_id");--> statement-breakpoint
CREATE INDEX "affiliate_products_category_idx" ON "affiliate_products" USING btree ("category");--> statement-breakpoint
CREATE INDEX "affiliate_products_is_active_idx" ON "affiliate_products" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "affiliate_products_created_at_idx" ON "affiliate_products" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "deal_obs_product_observed_idx" ON "product_deal_observations" USING btree ("product_id","observed_at");--> statement-breakpoint
CREATE INDEX "deal_obs_observed_at_idx" ON "product_deal_observations" USING btree ("observed_at");--> statement-breakpoint
CREATE INDEX "weekly_product_pool_week_rank_idx" ON "weekly_product_pool" USING btree ("week_start","rank");--> statement-breakpoint
CREATE INDEX "weekly_product_pool_week_product_idx" ON "weekly_product_pool" USING btree ("week_start","product_id");--> statement-breakpoint
CREATE INDEX "affiliate_replies_next_eligible_idx" ON "affiliate_replies" USING btree ("next_eligible_at");