CREATE TABLE "shopee_acquisition_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"external_run_id" text,
	"acquisition_batch_id" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"provider" text DEFAULT 'SHOPEE' NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"products_seen" integer DEFAULT 0 NOT NULL,
	"products_valid" integer DEFAULT 0 NOT NULL,
	"products_imported" integer DEFAULT 0 NOT NULL,
	"products_rejected" integer DEFAULT 0 NOT NULL,
	"warning_count" integer DEFAULT 0 NOT NULL,
	"source" text DEFAULT 'SHOPEE_SESSION_WORKER' NOT NULL,
	"error_summary" text,
	"raw_metadata_json" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "shopee_acq_batch_id_idx" ON "shopee_acquisition_runs" USING btree ("acquisition_batch_id");--> statement-breakpoint
CREATE INDEX "shopee_acq_status_idx" ON "shopee_acquisition_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "shopee_acq_created_at_idx" ON "shopee_acquisition_runs" USING btree ("created_at");