ALTER TABLE "monetization_plans" ADD COLUMN IF NOT EXISTS "trigger_mode" text DEFAULT 'DELAY';--> statement-breakpoint
ALTER TABLE "monetization_plans" ADD COLUMN IF NOT EXISTS "target_views" integer DEFAULT 300;--> statement-breakpoint
ALTER TABLE "monetization_plans" ADD COLUMN IF NOT EXISTS "target_replies" integer DEFAULT 2;--> statement-breakpoint
ALTER TABLE "monetization_plans" ADD COLUMN IF NOT EXISTS "max_wait_hours" integer DEFAULT 12;--> statement-breakpoint
ALTER TABLE "affiliate_replies" ADD COLUMN IF NOT EXISTS "trigger_mode" text DEFAULT 'DELAY';--> statement-breakpoint
ALTER TABLE "affiliate_replies" ADD COLUMN IF NOT EXISTS "target_views" integer DEFAULT 300;--> statement-breakpoint
ALTER TABLE "affiliate_replies" ADD COLUMN IF NOT EXISTS "target_replies" integer DEFAULT 2;--> statement-breakpoint
ALTER TABLE "affiliate_replies" ADD COLUMN IF NOT EXISTS "max_wait_hours" integer DEFAULT 12;
