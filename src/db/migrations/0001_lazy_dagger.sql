ALTER TABLE "posts" DROP CONSTRAINT "posts_account_id_threads_accounts_id_fk";
--> statement-breakpoint
ALTER TABLE "posts" ALTER COLUMN "account_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "account_threads_user_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "account_username" text NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "account_display_name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_account_id_threads_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."threads_accounts"("id") ON DELETE set null ON UPDATE no action;