import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

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

  // Threads API tracking
  containerId: text("container_id"),
  threadsPostId: text("threads_post_id"),

  // Status: PUBLISHING | PUBLISHED | FAILED
  status: text("status").notNull().default("PUBLISHING"),

  errorCode: text("error_code"),
  errorMessage: text("error_message"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
});

export type ThreadsAccount = typeof threadsAccounts.$inferSelect;
export type NewThreadsAccount = typeof threadsAccounts.$inferInsert;

export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
