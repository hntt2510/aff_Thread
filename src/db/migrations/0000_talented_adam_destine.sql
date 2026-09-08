CREATE TABLE "posts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"text" text NOT NULL,
	"container_id" text,
	"threads_post_id" text,
	"status" text DEFAULT 'PUBLISHING' NOT NULL,
	"error_code" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "threads_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"threads_user_id" text NOT NULL,
	"username" text NOT NULL,
	"display_name" text NOT NULL,
	"avatar_url" text,
	"biography" text,
	"encrypted_access_token" text NOT NULL,
	"token_iv" text NOT NULL,
	"token_auth_tag" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"last_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "threads_accounts_threads_user_id_unique" UNIQUE("threads_user_id")
);
--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_account_id_threads_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."threads_accounts"("id") ON DELETE cascade ON UPDATE no action;