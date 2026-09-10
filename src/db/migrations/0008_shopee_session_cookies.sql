CREATE TABLE "shopee_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"encrypted_cookies" text NOT NULL,
	"cookies_iv" text NOT NULL,
	"cookies_auth_tag" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"username" text,
	"affiliate_id" text,
	"last_validated_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "shopee_sessions_status_idx" ON "shopee_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "shopee_sessions_updated_at_idx" ON "shopee_sessions" USING btree ("updated_at");
