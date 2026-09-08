ALTER TABLE "posts" DROP CONSTRAINT "posts_account_id_threads_accounts_id_fk";
--> statement-breakpoint
ALTER TABLE "posts" ALTER COLUMN "account_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "account_threads_user_id" text;
--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "account_username" text;
--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "account_display_name" text;
--> statement-breakpoint
UPDATE "posts" p
SET
  "account_threads_user_id" = a."threads_user_id",
  "account_username"        = a."username",
  "account_display_name"    = a."display_name"
FROM "threads_accounts" a
WHERE p."account_id" = a."id"
  AND p."account_threads_user_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "posts" ALTER COLUMN "account_threads_user_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "posts" ALTER COLUMN "account_username" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "posts" ALTER COLUMN "account_display_name" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_account_id_threads_accounts_id_fk"
  FOREIGN KEY ("account_id") REFERENCES "public"."threads_accounts"("id")
  ON DELETE set null ON UPDATE no action;