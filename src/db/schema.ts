import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

// Postgres 12 rejects an explicit DEFAULT for GENERATED ALWAYS, which is how
  // Drizzle writes inserts. BY DEFAULT keeps the same behaviour for us.
  const identity = () => bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity();

export const users = pgTable("users", {
  id: identity(),
  /** Telegram user id, up to 52 bits, so a JS number is exact. */
  telegramId: bigint("telegram_id", { mode: "number" }).notNull().unique(),
  username: text("username"),
  firstName: text("first_name").notNull(),
  lastName: text("last_name"),
  languageCode: text("language_code"),
  isPremium: boolean("is_premium").notNull().default(false),
  photoUrl: text("photo_url"),
  /** Uploader notifications about reactions, comments and ratings. */
  notify: boolean("notify").notNull().default(true),
  /** Set the first time the user talks to the bot; gates the Mini App. */
  startedAt: timestamp("started_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * One in-flight upload per Telegram user. The bot asks for a photo, then a
 * caption, then shows a confirmation; the row survives restarts so a pm2
 * reload mid-conversation does not lose the user photo.
 */
export const uploadSessions = pgTable(
  "upload_sessions",
  {
    telegramId: bigint("telegram_id", { mode: "number" }).primaryKey(),
    /** "photo" | "caption" | "confirm" */
    step: text("step").notNull(),
    fileId: text("file_id"),
    imageWidth: integer("image_width"),
    imageHeight: integer("image_height"),
    caption: text("caption"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("upload_sessions_step_valid", sql`${table.step} in ('photo', 'caption', 'confirm')`),
  ],
);

export const photos = pgTable(
  "photos",
  {
    id: identity(),
    slug: text("slug").notNull().unique(),
    caption: text("caption").notNull(),
    imageUrl: text("image_url").notNull(),
    imageWidth: integer("image_width").notNull(),
    imageHeight: integer("image_height").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    /** Uploader; null for photos published before ownership existed. */
    userId: bigint("user_id", { mode: "number" }).references(() => users.id, {
      onDelete: "set null",
    }),
    /** Last time a reaction/rating digest went out for this photo. */
    lastDigestAt: timestamp("last_digest_at", { withTimezone: true }),
    /** Channel post for this photo, so a manual delete can remove it too. */
    channelMessageId: bigint("channel_message_id", { mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("photos_width_positive", sql`${table.imageWidth} > 0`),
    check("photos_height_positive", sql`${table.imageHeight} > 0`),
    index("photos_user_idx").on(table.userId),
  ],
);

export const spots = pgTable(
  "spots",
  {
    id: identity(),
    photoId: bigint("photo_id", { mode: "number" })
      .notNull()
      .references(() => photos.id, { onDelete: "cascade" }),
    /** 0..1 relative to the rendered image box, not the container. */
    x: real("x").notNull(),
    y: real("y").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Redundant for uniqueness, required as the target of the composite FK.
    unique("spots_id_photo").on(table.id, table.photoId),
    index("spots_photo_idx").on(table.photoId),
    check("spots_x_range", sql`${table.x} between 0 and 1`),
    check("spots_y_range", sql`${table.y} between 0 and 1`),
  ],
);

export const reactions = pgTable(
  "reactions",
  {
    id: identity(),
    photoId: bigint("photo_id", { mode: "number" })
      .notNull()
      .references(() => photos.id, { onDelete: "cascade" }),
    spotId: bigint("spot_id", { mode: "number" }).notNull(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    emoji: text("emoji").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // One reaction per user per photo, enforced by the database.
    unique("reactions_photo_user").on(table.photoId, table.userId),
    index("reactions_spot_idx").on(table.spotId, table.emoji),
    foreignKey({
      name: "reactions_spot_photo_fk",
      columns: [table.spotId, table.photoId],
      foreignColumns: [spots.id, spots.photoId],
    }).onDelete("cascade"),
  ],
);

export const comments = pgTable(
  "comments",
  {
    id: identity(),
    photoId: bigint("photo_id", { mode: "number" })
      .notNull()
      .references(() => photos.id, { onDelete: "cascade" }),
    /** Spot the comment is pinned to; comments and reactions share a point. */
    spotId: bigint("spot_id", { mode: "number" }).notNull(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("comments_spot_idx").on(table.spotId, table.createdAt),
    // One comment per user per photo, mirroring the one-reaction rule.
    unique("comments_photo_user_key").on(table.photoId, table.userId),
    foreignKey({
      name: "comments_spot_photo_fk",
      columns: [table.spotId, table.photoId],
      foreignColumns: [spots.id, spots.photoId],
    }).onDelete("cascade"),
    check("comments_body_length", sql`char_length(${table.body}) between 1 and 500`),
  ],
);

export const ratings = pgTable(
  "ratings",
  {
    photoId: bigint("photo_id", { mode: "number" })
      .notNull()
      .references(() => photos.id, { onDelete: "cascade" }),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    score: real("score").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.photoId, table.userId] }),
    check("ratings_score_range", sql`${table.score} between 1 and 10`),
  ],
);

/**
 * Outbox for uploader notifications. Rows are written inside the same
 * transaction as the action, then delivered by the cron sweep, so a failed
 * Telegram call is retried instead of lost.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: identity(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    photoId: bigint("photo_id", { mode: "number" })
      .notNull()
      .references(() => photos.id, { onDelete: "cascade" }),
    /** "comment" | "digest" */
    kind: text("kind").notNull(),
    /** Idempotency key, e.g. "comment:12". */
    dedupeKey: text("dedupe_key").notNull().unique(),
    body: text("body").notNull(),
    attempts: integer("attempts").notNull().default(0),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("notifications_pending_idx").on(table.userId, table.sentAt),
    check("notifications_kind_valid", sql`${table.kind} in ('comment', 'digest')`),
  ],
);
