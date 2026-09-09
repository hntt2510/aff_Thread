import { pgTable, text, timestamp, integer, boolean, index } from "drizzle-orm/pg-core";
import type { PostStatus, PostMediaType, PostProcessingStatus } from "@/lib/posts/lifecycle";

export const threadsAccounts = pgTable("threads_accounts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  threadsUserId: text("threads_user_id").notNull().unique(),
  username: text("username").notNull(),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  biography: text("biography"),

  // Encrypted access token components (AES-256-GCM)
  encryptedAccessToken: text("encrypted_access_token").notNull(),
  tokenIv: text("token_iv").notNull(),
  tokenAuthTag: text("token_auth_tag").notNull(),

  // Status: ACTIVE | INVALID_TOKEN | ERROR
  status: text("status").notNull().default("ACTIVE"),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const posts = pgTable("posts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  accountId: text("account_id")
    .references(() => threadsAccounts.id, { onDelete: "set null" }),

  // Immutable historical account snapshot fields preserved even if account is removed/disconnected
  accountThreadsUserId: text("account_threads_user_id").notNull(),
  accountUsername: text("account_username").notNull(),
  accountDisplayName: text("account_display_name").notNull(),

  text: text("text").notNull(),

  // Media type: TEXT | IMAGE | VIDEO | CAROUSEL
  mediaType: text("media_type").$type<PostMediaType>().notNull().default("TEXT"),
  // Asynchronous container readiness status: IN_PROGRESS | FINISHED | ERROR | null
  processingStatus: text("processing_status").$type<PostProcessingStatus>(),

  // Threads API tracking
  containerId: text("container_id"),
  threadsPostId: text("threads_post_id"),

  // Status: DRAFT | SCHEDULED | PUBLISHING | PUBLISHED | FAILED | CANCELLED
  status: text("status").$type<PostStatus>().notNull().default("PUBLISHING"),

  errorCode: text("error_code"),
  errorMessage: text("error_message"),

  // Scheduling & queue fields
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  failedAt: timestamp("failed_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),

  // Retry & attempt tracking
  publishAttempts: integer("publish_attempts").notNull().default(0),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
  lastError: text("last_error"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const mediaAssets = pgTable("media_assets", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  accountId: text("account_id")
    .references(() => threadsAccounts.id, { onDelete: "set null" }),
  storageProvider: text("storage_provider").notNull().default("CLOUDINARY"),
  publicId: text("public_id").notNull().unique(),
  resourceType: text("resource_type").notNull(), // "image" | "video"
  secureUrl: text("secure_url").notNull(),
  originalFilename: text("original_filename"),
  bytes: integer("bytes"),
  width: integer("width"),
  height: integer("height"),
  format: text("format"),
  durationSeconds: integer("duration_seconds"),
  uploadStatus: text("upload_status").notNull().default("READY"), // "UPLOADING" | "READY" | "FAILED" | "DELETED"
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("media_assets_public_id_idx").on(table.publicId),
  index("media_assets_resource_type_idx").on(table.resourceType),
  index("media_assets_created_at_idx").on(table.createdAt),
  index("media_assets_deleted_at_idx").on(table.deletedAt),
]);

export const postMedia = pgTable("post_media", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  postId: text("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  mediaAssetId: text("media_asset_id").references(() => mediaAssets.id, { onDelete: "set null" }),
  mediaKind: text("media_kind").notNull(), // "IMAGE" | "VIDEO"
  sourceUrl: text("source_url").notNull(),
  position: integer("position").notNull().default(0),
  altText: text("alt_text"),
  containerId: text("container_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("post_media_post_id_idx").on(table.postId),
  index("post_media_position_idx").on(table.postId, table.position),
  index("post_media_asset_id_idx").on(table.mediaAssetId),
]);

export const affiliateCampaigns = pgTable("affiliate_campaigns", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  network: text("network"),
  description: text("description"),
  status: text("status").notNull().default("ACTIVE"), // "ACTIVE" | "PAUSED" | "ARCHIVED"
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const affiliateLinks = pgTable("affiliate_links", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  campaignId: text("campaign_id").references(() => affiliateCampaigns.id, { onDelete: "set null" }),
  destinationUrl: text("destination_url").notNull(),
  publicSlug: text("public_slug").notNull().unique(),
  label: text("label"),
  network: text("network"),
  subId: text("sub_id"),
  status: text("status").notNull().default("ACTIVE"), // "ACTIVE" | "PAUSED"
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("affiliate_links_slug_idx").on(table.publicSlug),
  index("affiliate_links_campaign_idx").on(table.campaignId),
  index("affiliate_links_status_idx").on(table.status),
]);

export const postAffiliateLinks = pgTable("post_affiliate_links", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  postId: text("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  affiliateLinkId: text("affiliate_link_id").notNull().references(() => affiliateLinks.id, { onDelete: "cascade" }),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("post_affiliate_links_post_idx").on(table.postId),
  index("post_affiliate_links_link_idx").on(table.affiliateLinkId),
]);

export const affiliateClicks = pgTable("affiliate_clicks", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  affiliateLinkId: text("affiliate_link_id").notNull().references(() => affiliateLinks.id, { onDelete: "cascade" }),
  postId: text("post_id").references(() => posts.id, { onDelete: "set null" }),
  campaignId: text("campaign_id").references(() => affiliateCampaigns.id, { onDelete: "set null" }),
  clickedAt: timestamp("clicked_at", { withTimezone: true }).notNull().defaultNow(),
  anonymizedIpHash: text("anonymized_ip_hash"),
  userAgentClass: text("user_agent_class"), // "MOBILE" | "DESKTOP" | "BOT" | "UNKNOWN"
  isBot: boolean("is_bot").notNull().default(false),
  refererDomain: text("referer_domain"),
  country: text("country"),
}, (table) => [
  index("affiliate_clicks_link_idx").on(table.affiliateLinkId),
  index("affiliate_clicks_post_idx").on(table.postId),
  index("affiliate_clicks_clicked_at_idx").on(table.clickedAt),
  index("affiliate_clicks_is_bot_idx").on(table.isBot),
]);

export const schedulerRuns = pgTable("scheduler_runs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  triggerSource: text("trigger_source").notNull().default("cron-job-org"),
  claimed: integer("claimed").notNull().default(0),
  published: integer("published").notNull().default(0),
  rescheduled: integer("rescheduled").notNull().default(0),
  failed: integer("failed").notNull().default(0),
  staleRecovered: integer("stale_recovered").notNull().default(0),
  durationMs: integer("duration_ms").notNull().default(0),
  sanitizedError: text("sanitized_error"),
}, (table) => [
  index("scheduler_runs_started_at_idx").on(table.startedAt),
]);

export type ThreadsAccount = typeof threadsAccounts.$inferSelect;
export type NewThreadsAccount = typeof threadsAccounts.$inferInsert;

export type MediaAsset = typeof mediaAssets.$inferSelect;
export type NewMediaAsset = typeof mediaAssets.$inferInsert;

export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;

export type PostMedia = typeof postMedia.$inferSelect;
export type NewPostMedia = typeof postMedia.$inferInsert;

export type AffiliateCampaign = typeof affiliateCampaigns.$inferSelect;
export type NewAffiliateCampaign = typeof affiliateCampaigns.$inferInsert;

export type AffiliateLink = typeof affiliateLinks.$inferSelect;
export type NewAffiliateLink = typeof affiliateLinks.$inferInsert;

export type PostAffiliateLink = typeof postAffiliateLinks.$inferSelect;
export type NewPostAffiliateLink = typeof postAffiliateLinks.$inferInsert;

export type AffiliateClick = typeof affiliateClicks.$inferSelect;
export type NewAffiliateClick = typeof affiliateClicks.$inferInsert;

export type SchedulerRun = typeof schedulerRuns.$inferSelect;
export type NewSchedulerRun = typeof schedulerRuns.$inferInsert;

export type MonetizationEligibilityStatus =
  | "WATCHING"
  | "ELIGIBLE"
  | "PLANNED"
  | "MONETIZING"
  | "MONETIZED"
  | "SKIPPED"
  | "FAILED";

export type MonetizationPlanStatus =
  | "DRAFT"
  | "READY"
  | "RUNNING"
  | "COMPLETED"
  | "PARTIAL"
  | "FAILED"
  | "CANCELLED";

export type MonetizationPlanSource =
  | "MANUAL"
  | "RULE_ENGINE"
  | "SHOPEE_DEAL_ENGINE";

export type AffiliateReplyStatus =
  | "PENDING"
  | "READY"
  | "CLAIMED"
  | "SUBMITTING"
  | "PUBLISHED"
  | "AMBIGUOUS"
  | "FAILED"
  | "CANCELLED";

export const postInsightSnapshots = pgTable("post_insight_snapshots", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  postId: text("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  threadsPostId: text("threads_post_id").notNull(),
  views: integer("views"),
  likes: integer("likes"),
  replies: integer("replies"),
  reposts: integer("reposts"),
  quotes: integer("quotes"),
  shares: integer("shares"),
  rawMetricsJson: text("raw_metrics_json"),
  collectedAt: timestamp("collected_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("post_insight_snapshots_post_collected_idx").on(table.postId, table.collectedAt),
  index("post_insight_snapshots_collected_at_idx").on(table.collectedAt),
  index("post_insight_snapshots_threads_post_id_idx").on(table.threadsPostId),
]);

export const postMonetizationState = pgTable("post_monetization_state", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  postId: text("post_id").notNull().unique().references(() => posts.id, { onDelete: "cascade" }),
  status: text("status").$type<MonetizationEligibilityStatus>().notNull().default("WATCHING"),
  currentScore: integer("current_score").notNull().default(0),
  scoreVersion: text("score_version").notNull().default("v1"),
  scoreExplanation: text("score_explanation"),
  firstEligibleAt: timestamp("first_eligible_at", { withTimezone: true }),
  lastEvaluatedAt: timestamp("last_evaluated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("post_monetization_state_status_idx").on(table.status),
  index("post_monetization_state_score_idx").on(table.currentScore),
  index("post_monetization_state_last_eval_idx").on(table.lastEvaluatedAt),
]);

export const monetizationPlans = pgTable("monetization_plans", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  postId: text("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  status: text("status").$type<MonetizationPlanStatus>().notNull().default("DRAFT"),
  source: text("source").$type<MonetizationPlanSource>().notNull().default("MANUAL"),
  scoreAtCreation: integer("score_at_creation"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("monetization_plans_post_id_idx").on(table.postId),
  index("monetization_plans_status_idx").on(table.status),
  index("monetization_plans_scheduled_at_idx").on(table.scheduledAt),
]);

export const affiliateReplies = pgTable("affiliate_replies", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  monetizationPlanId: text("monetization_plan_id").notNull().references(() => monetizationPlans.id, { onDelete: "cascade" }),
  postId: text("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  sequenceNo: integer("sequence_no").notNull().default(1),
  replyText: text("reply_text").notNull(),
  status: text("status").$type<AffiliateReplyStatus>().notNull().default("PENDING"),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  threadsContainerId: text("threads_container_id"),
  threadsReplyId: text("threads_reply_id"),
  attempts: integer("attempts").notNull().default(0),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
  lastError: text("last_error"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  nextEligibleAt: timestamp("next_eligible_at", { withTimezone: true }),
  dealObservationId: text("deal_observation_id"),
  priceCalculationSnapshot: text("price_calculation_snapshot"),
  requiresRevalidation: boolean("requires_revalidation").default(false),
  lastValidatedAt: timestamp("last_validated_at", { withTimezone: true }),
  validationStatus: text("validation_status").default("NOT_REQUIRED"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("affiliate_replies_plan_idx").on(table.monetizationPlanId),
  index("affiliate_replies_post_idx").on(table.postId),
  index("affiliate_replies_status_idx").on(table.status),
  index("affiliate_replies_scheduled_at_idx").on(table.scheduledAt),
  index("affiliate_replies_next_eligible_idx").on(table.nextEligibleAt),
  index("affiliate_replies_idempotency_key_idx").on(table.idempotencyKey),
]);

export const affiliateReplyLinks = pgTable("affiliate_reply_links", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  affiliateReplyId: text("affiliate_reply_id").notNull().references(() => affiliateReplies.id, { onDelete: "cascade" }),
  affiliateLinkId: text("affiliate_link_id").references(() => affiliateLinks.id, { onDelete: "set null" }),
  destinationUrl: text("destination_url").notNull(),
  position: integer("position").notNull().default(0),
  label: text("label"),
  metadataJson: text("metadata_json"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("affiliate_reply_links_reply_idx").on(table.affiliateReplyId),
  index("affiliate_reply_links_link_idx").on(table.affiliateLinkId),
]);

export const monetizationRuns = pgTable("monetization_runs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  triggerSource: text("trigger_source").notNull().default("cron-job-org"),
  collected: integer("collected").notNull().default(0),
  evaluated: integer("evaluated").notNull().default(0),
  eligible: integer("eligible").notNull().default(0),
  repliesClaimed: integer("replies_claimed").notNull().default(0),
  repliesPublished: integer("replies_published").notNull().default(0),
  repliesDeferred: integer("replies_deferred").notNull().default(0),
  repliesFailed: integer("replies_failed").notNull().default(0),
  ambiguous: integer("ambiguous").notNull().default(0),
  durationMs: integer("duration_ms").notNull().default(0),
  sanitizedError: text("sanitized_error"),
}, (table) => [
  index("monetization_runs_started_at_idx").on(table.startedAt),
]);

export type PostInsightSnapshot = typeof postInsightSnapshots.$inferSelect;
export type NewPostInsightSnapshot = typeof postInsightSnapshots.$inferInsert;

export type PostMonetizationState = typeof postMonetizationState.$inferSelect;
export type NewPostMonetizationState = typeof postMonetizationState.$inferInsert;

export type MonetizationPlan = typeof monetizationPlans.$inferSelect;
export type NewMonetizationPlan = typeof monetizationPlans.$inferInsert;

export type AffiliateReply = typeof affiliateReplies.$inferSelect;
export type NewAffiliateReply = typeof affiliateReplies.$inferInsert;

export type AffiliateReplyLink = typeof affiliateReplyLinks.$inferSelect;
export type NewAffiliateReplyLink = typeof affiliateReplyLinks.$inferInsert;

export type MonetizationRun = typeof monetizationRuns.$inferSelect;
export type NewMonetizationRun = typeof monetizationRuns.$inferInsert;

export const affiliateProducts = pgTable("affiliate_products", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  provider: text("provider").notNull().default("SHOPEE"),
  externalProductId: text("external_product_id"),
  shopId: text("shop_id"),
  title: text("title").notNull(),
  normalizedTitle: text("normalized_title"),
  category: text("category"),
  productUrl: text("product_url").notNull(),
  imageUrl: text("image_url"),
  currency: text("currency").notNull().default("VND"),
  isActive: boolean("is_active").notNull().default(true),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("affiliate_products_provider_ext_idx").on(table.provider, table.externalProductId),
  index("affiliate_products_category_idx").on(table.category),
  index("affiliate_products_is_active_idx").on(table.isActive),
  index("affiliate_products_created_at_idx").on(table.createdAt),
]);

export const affiliateProductOffers = pgTable("affiliate_product_offers", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  productId: text("product_id").notNull().references(() => affiliateProducts.id, { onDelete: "cascade" }),
  capturedWeek: text("captured_week").notNull(),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
  affiliateUrl: text("affiliate_url").notNull(),
  commissionRate: text("commission_rate"),
  commissionAmount: integer("commission_amount"),
  soldCount: integer("sold_count"),
  source: text("source").notNull().default("MANUAL_IMPORT"),
  sourceMetadataJson: text("source_metadata_json"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("affiliate_product_offers_product_week_idx").on(table.productId, table.capturedWeek),
  index("affiliate_product_offers_captured_week_idx").on(table.capturedWeek),
  index("affiliate_product_offers_product_id_idx").on(table.productId),
]);

export const affiliatePerformanceSnapshots = pgTable("affiliate_performance_snapshots", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  productId: text("product_id").references(() => affiliateProducts.id, { onDelete: "set null" }),
  offerId: text("offer_id").references(() => affiliateProductOffers.id, { onDelete: "set null" }),
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
  clicks: integer("clicks"),
  orders: integer("orders"),
  itemsSold: integer("items_sold"),
  orderAmount: integer("order_amount"),
  estimatedCommission: integer("estimated_commission"),
  source: text("source").notNull().default("SHOPEE_REPORT"),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("affiliate_perf_product_period_idx").on(table.productId, table.periodStart),
  index("affiliate_perf_period_start_idx").on(table.periodStart),
]);

export const weeklyProductPool = pgTable("weekly_product_pool", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  weekStart: text("week_start").notNull(),
  productId: text("product_id").notNull().references(() => affiliateProducts.id, { onDelete: "cascade" }),
  offerId: text("offer_id").references(() => affiliateProductOffers.id, { onDelete: "set null" }),
  rank: integer("rank").notNull(),
  catalogScore: integer("catalog_score").notNull().default(0),
  reasonJson: text("reason_json"),
  selectedAt: timestamp("selected_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("weekly_product_pool_week_rank_idx").on(table.weekStart, table.rank),
  index("weekly_product_pool_week_product_idx").on(table.weekStart, table.productId),
]);

export const productDealObservations = pgTable("product_deal_observations", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  productId: text("product_id").notNull().references(() => affiliateProducts.id, { onDelete: "cascade" }),
  offerId: text("offer_id").references(() => affiliateProductOffers.id, { onDelete: "set null" }),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
  observedPrice: integer("observed_price"),
  originalPrice: integer("original_price"),
  currency: text("currency").notNull().default("VND"),
  directDiscountPercent: text("direct_discount_percent"),
  directDiscountAmount: integer("direct_discount_amount"),
  voucherCode: text("voucher_code"),
  voucherType: text("voucher_type"),
  voucherDiscountType: text("voucher_discount_type"),
  voucherDiscountPercent: text("voucher_discount_percent"),
  voucherDiscountAmount: integer("voucher_discount_amount"),
  voucherMaxDiscount: integer("voucher_max_discount"),
  voucherMinSpend: integer("voucher_min_spend"),
  voucherValidFrom: timestamp("voucher_valid_from", { withTimezone: true }),
  voucherValidUntil: timestamp("voucher_valid_until", { withTimezone: true }),
  flashSale: boolean("flash_sale"),
  freeShipping: boolean("free_shipping"),
  availabilityStatus: text("availability_status"),
  source: text("source").notNull().default("MANUAL"),
  confidence: text("confidence").default("1.00"),
  rawMetadataJson: text("raw_metadata_json"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("deal_obs_product_observed_idx").on(table.productId, table.observedAt),
  index("deal_obs_observed_at_idx").on(table.observedAt),
]);

export type AffiliateProduct = typeof affiliateProducts.$inferSelect;
export type NewAffiliateProduct = typeof affiliateProducts.$inferInsert;

export type AffiliateProductOffer = typeof affiliateProductOffers.$inferSelect;
export type NewAffiliateProductOffer = typeof affiliateProductOffers.$inferInsert;

export type AffiliatePerformanceSnapshot = typeof affiliatePerformanceSnapshots.$inferSelect;
export type NewAffiliatePerformanceSnapshot = typeof affiliatePerformanceSnapshots.$inferInsert;

export type WeeklyProductPoolItem = typeof weeklyProductPool.$inferSelect;
export type NewWeeklyProductPoolItem = typeof weeklyProductPool.$inferInsert;

export type ProductDealObservation = typeof productDealObservations.$inferSelect;
export type NewProductDealObservation = typeof productDealObservations.$inferInsert;

export type ShopeeAcquisitionStatus = "PENDING" | "RUNNING" | "SUCCESS" | "PARTIAL" | "FAILED";

export const shopeeAcquisitionRuns = pgTable("shopee_acquisition_runs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  externalRunId: text("external_run_id"),
  acquisitionBatchId: text("acquisition_batch_id").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  provider: text("provider").notNull().default("SHOPEE"),
  status: text("status").$type<ShopeeAcquisitionStatus>().notNull().default("PENDING"),
  productsSeen: integer("products_seen").notNull().default(0),
  productsValid: integer("products_valid").notNull().default(0),
  productsImported: integer("products_imported").notNull().default(0),
  productsRejected: integer("products_rejected").notNull().default(0),
  warningCount: integer("warning_count").notNull().default(0),
  source: text("source").notNull().default("SHOPEE_SESSION_WORKER"),
  errorSummary: text("error_summary"),
  rawMetadataJson: text("raw_metadata_json"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("shopee_acq_batch_id_idx").on(table.acquisitionBatchId),
  index("shopee_acq_status_idx").on(table.status),
  index("shopee_acq_created_at_idx").on(table.createdAt),
]);

export type ShopeeAcquisitionRun = typeof shopeeAcquisitionRuns.$inferSelect;
export type NewShopeeAcquisitionRun = typeof shopeeAcquisitionRuns.$inferInsert;
