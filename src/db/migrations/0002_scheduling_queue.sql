ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "scheduled_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "failed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "cancelled_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "publish_attempts" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "last_attempt_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "last_error" text;
--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "posts_scheduled_due_idx" ON "posts" ("status", "scheduled_at") WHERE "status" = 'SCHEDULED';
