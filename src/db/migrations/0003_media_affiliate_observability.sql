CREATE TABLE "affiliate_campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"network" text,
	"description" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "affiliate_clicks" (
	"id" text PRIMARY KEY NOT NULL,
	"affiliate_link_id" text NOT NULL,
	"post_id" text,
	"campaign_id" text,
	"clicked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"anonymized_ip_hash" text,
	"user_agent_class" text,
	"is_bot" boolean DEFAULT false NOT NULL,
	"referer_domain" text,
	"country" text
);
--> statement-breakpoint
CREATE TABLE "affiliate_links" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text,
	"destination_url" text NOT NULL,
	"public_slug" text NOT NULL,
	"label" text,
	"network" text,
	"sub_id" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "affiliate_links_public_slug_unique" UNIQUE("public_slug")
);
--> statement-breakpoint
CREATE TABLE "post_affiliate_links" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"affiliate_link_id" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_media" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"media_kind" text NOT NULL,
	"source_url" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"alt_text" text,
	"container_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduler_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"trigger_source" text DEFAULT 'cron-job-org' NOT NULL,
	"claimed" integer DEFAULT 0 NOT NULL,
	"published" integer DEFAULT 0 NOT NULL,
	"rescheduled" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"stale_recovered" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"sanitized_error" text
);
--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "media_type" text DEFAULT 'TEXT' NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "processing_status" text;--> statement-breakpoint
ALTER TABLE "affiliate_clicks" ADD CONSTRAINT "affiliate_clicks_affiliate_link_id_affiliate_links_id_fk" FOREIGN KEY ("affiliate_link_id") REFERENCES "public"."affiliate_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_clicks" ADD CONSTRAINT "affiliate_clicks_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_clicks" ADD CONSTRAINT "affiliate_clicks_campaign_id_affiliate_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."affiliate_campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_links" ADD CONSTRAINT "affiliate_links_campaign_id_affiliate_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."affiliate_campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_affiliate_links" ADD CONSTRAINT "post_affiliate_links_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_affiliate_links" ADD CONSTRAINT "post_affiliate_links_affiliate_link_id_affiliate_links_id_fk" FOREIGN KEY ("affiliate_link_id") REFERENCES "public"."affiliate_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_media" ADD CONSTRAINT "post_media_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "affiliate_clicks_link_idx" ON "affiliate_clicks" USING btree ("affiliate_link_id");--> statement-breakpoint
CREATE INDEX "affiliate_clicks_post_idx" ON "affiliate_clicks" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "affiliate_clicks_clicked_at_idx" ON "affiliate_clicks" USING btree ("clicked_at");--> statement-breakpoint
CREATE INDEX "affiliate_clicks_is_bot_idx" ON "affiliate_clicks" USING btree ("is_bot");--> statement-breakpoint
CREATE INDEX "affiliate_links_slug_idx" ON "affiliate_links" USING btree ("public_slug");--> statement-breakpoint
CREATE INDEX "affiliate_links_campaign_idx" ON "affiliate_links" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "affiliate_links_status_idx" ON "affiliate_links" USING btree ("status");--> statement-breakpoint
CREATE INDEX "post_affiliate_links_post_idx" ON "post_affiliate_links" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "post_affiliate_links_link_idx" ON "post_affiliate_links" USING btree ("affiliate_link_id");--> statement-breakpoint
CREATE INDEX "post_media_post_id_idx" ON "post_media" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "post_media_position_idx" ON "post_media" USING btree ("post_id","position");--> statement-breakpoint
CREATE INDEX "scheduler_runs_started_at_idx" ON "scheduler_runs" USING btree ("started_at");