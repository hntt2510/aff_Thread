CREATE TABLE "affiliate_replies" (
	"id" text PRIMARY KEY NOT NULL,
	"monetization_plan_id" text NOT NULL,
	"post_id" text NOT NULL,
	"sequence_no" integer DEFAULT 1 NOT NULL,
	"reply_text" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"idempotency_key" text NOT NULL,
	"threads_container_id" text,
	"threads_reply_id" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"last_error" text,
	"scheduled_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "affiliate_replies_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "affiliate_reply_links" (
	"id" text PRIMARY KEY NOT NULL,
	"affiliate_reply_id" text NOT NULL,
	"affiliate_link_id" text,
	"destination_url" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"label" text,
	"metadata_json" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monetization_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"source" text DEFAULT 'MANUAL' NOT NULL,
	"score_at_creation" integer,
	"scheduled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monetization_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"trigger_source" text DEFAULT 'cron-job-org' NOT NULL,
	"collected" integer DEFAULT 0 NOT NULL,
	"evaluated" integer DEFAULT 0 NOT NULL,
	"eligible" integer DEFAULT 0 NOT NULL,
	"replies_claimed" integer DEFAULT 0 NOT NULL,
	"replies_published" integer DEFAULT 0 NOT NULL,
	"replies_deferred" integer DEFAULT 0 NOT NULL,
	"replies_failed" integer DEFAULT 0 NOT NULL,
	"ambiguous" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"sanitized_error" text
);
--> statement-breakpoint
CREATE TABLE "post_insight_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"threads_post_id" text NOT NULL,
	"views" integer,
	"likes" integer,
	"replies" integer,
	"reposts" integer,
	"quotes" integer,
	"shares" integer,
	"raw_metrics_json" text,
	"collected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_monetization_state" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"status" text DEFAULT 'WATCHING' NOT NULL,
	"current_score" integer DEFAULT 0 NOT NULL,
	"score_version" text DEFAULT 'v1' NOT NULL,
	"score_explanation" text,
	"first_eligible_at" timestamp with time zone,
	"last_evaluated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_monetization_state_post_id_unique" UNIQUE("post_id")
);
--> statement-breakpoint
ALTER TABLE "affiliate_replies" ADD CONSTRAINT "affiliate_replies_monetization_plan_id_monetization_plans_id_fk" FOREIGN KEY ("monetization_plan_id") REFERENCES "public"."monetization_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_replies" ADD CONSTRAINT "affiliate_replies_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_reply_links" ADD CONSTRAINT "affiliate_reply_links_affiliate_reply_id_affiliate_replies_id_fk" FOREIGN KEY ("affiliate_reply_id") REFERENCES "public"."affiliate_replies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_reply_links" ADD CONSTRAINT "affiliate_reply_links_affiliate_link_id_affiliate_links_id_fk" FOREIGN KEY ("affiliate_link_id") REFERENCES "public"."affiliate_links"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monetization_plans" ADD CONSTRAINT "monetization_plans_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_insight_snapshots" ADD CONSTRAINT "post_insight_snapshots_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_monetization_state" ADD CONSTRAINT "post_monetization_state_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "affiliate_replies_plan_idx" ON "affiliate_replies" USING btree ("monetization_plan_id");--> statement-breakpoint
CREATE INDEX "affiliate_replies_post_idx" ON "affiliate_replies" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "affiliate_replies_status_idx" ON "affiliate_replies" USING btree ("status");--> statement-breakpoint
CREATE INDEX "affiliate_replies_scheduled_at_idx" ON "affiliate_replies" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "affiliate_replies_idempotency_key_idx" ON "affiliate_replies" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "affiliate_reply_links_reply_idx" ON "affiliate_reply_links" USING btree ("affiliate_reply_id");--> statement-breakpoint
CREATE INDEX "affiliate_reply_links_link_idx" ON "affiliate_reply_links" USING btree ("affiliate_link_id");--> statement-breakpoint
CREATE INDEX "monetization_plans_post_id_idx" ON "monetization_plans" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "monetization_plans_status_idx" ON "monetization_plans" USING btree ("status");--> statement-breakpoint
CREATE INDEX "monetization_plans_scheduled_at_idx" ON "monetization_plans" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "monetization_runs_started_at_idx" ON "monetization_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "post_insight_snapshots_post_collected_idx" ON "post_insight_snapshots" USING btree ("post_id","collected_at");--> statement-breakpoint
CREATE INDEX "post_insight_snapshots_collected_at_idx" ON "post_insight_snapshots" USING btree ("collected_at");--> statement-breakpoint
CREATE INDEX "post_insight_snapshots_threads_post_id_idx" ON "post_insight_snapshots" USING btree ("threads_post_id");--> statement-breakpoint
CREATE INDEX "post_monetization_state_status_idx" ON "post_monetization_state" USING btree ("status");--> statement-breakpoint
CREATE INDEX "post_monetization_state_score_idx" ON "post_monetization_state" USING btree ("current_score");--> statement-breakpoint
CREATE INDEX "post_monetization_state_last_eval_idx" ON "post_monetization_state" USING btree ("last_evaluated_at");