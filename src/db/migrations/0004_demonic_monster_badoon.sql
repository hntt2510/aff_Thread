CREATE TABLE "media_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text,
	"storage_provider" text DEFAULT 'CLOUDINARY' NOT NULL,
	"public_id" text NOT NULL,
	"resource_type" text NOT NULL,
	"secure_url" text NOT NULL,
	"original_filename" text,
	"bytes" integer,
	"width" integer,
	"height" integer,
	"format" text,
	"duration_seconds" integer,
	"upload_status" text DEFAULT 'READY' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_assets_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
ALTER TABLE "post_media" ADD COLUMN "media_asset_id" text;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_account_id_threads_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."threads_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_assets_public_id_idx" ON "media_assets" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX "media_assets_resource_type_idx" ON "media_assets" USING btree ("resource_type");--> statement-breakpoint
CREATE INDEX "media_assets_created_at_idx" ON "media_assets" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "media_assets_deleted_at_idx" ON "media_assets" USING btree ("deleted_at");--> statement-breakpoint
ALTER TABLE "post_media" ADD CONSTRAINT "post_media_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "post_media_asset_id_idx" ON "post_media" USING btree ("media_asset_id");